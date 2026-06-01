const vscode = require('vscode');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');

let serverProcess = null;
let outputChannel;
let argoPortForwardTerminal = null;
let extensionContext = null;

function getWorkspaceRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? folder.uri.fsPath : undefined;
}

function getServerCommand(workspaceRoot) {
  const pkgPath = path.join(workspaceRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  return { command: 'npm', args: ['start'], options: { cwd: workspaceRoot, shell: true } };
}

function log(message) {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('MCP Atlassian');
  }
  outputChannel.appendLine(`${new Date().toISOString()} ${message}`);
}

function getConfig() {
  const config = vscode.workspace.getConfiguration('mcpAtlassian');
  return {
    serverUrl: config.get('serverUrl', 'http://localhost:3000').replace(/\/$/, ''),
    argoUrl: config.get('argoUrl', 'http://localhost:8080').replace(/\/$/, '')
  };
}

async function callMcp(path, options = {}) {
  const { serverUrl } = getConfig();
  const url = `${serverUrl}${path}`;
  const init = { ...options };
  if (init.body && typeof init.body !== 'string') {
    init.body = JSON.stringify(init.body);
    init.headers = { ...(init.headers || {}), 'Content-Type': 'application/json' };
  }
  const response = await fetch(url, init);
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
    throw new Error(`${response.status} ${response.statusText}: ${message}`);
  }
  return body;
}

function openUrl(path) {
  const { serverUrl } = getConfig();
  const url = path.startsWith('/') ? `${serverUrl}${path}` : `${serverUrl}/${path}`;
  vscode.env.openExternal(vscode.Uri.parse(url));
}

async function askInput(prompt, placeHolder, value) {
  return vscode.window.showInputBox({ prompt, placeHolder, value });
}

async function askRequiredInput(prompt, placeHolder) {
  const value = await askInput(prompt, placeHolder);
  if (!value || !value.trim()) {
    throw new Error('Input required.');
  }
  return value.trim();
}

function showResultInOutput(title, data) {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('MCP Atlassian');
  }
  outputChannel.show(true);
  outputChannel.appendLine(`=== ${title} ===`);
  outputChannel.appendLine(JSON.stringify(data, null, 2));
  outputChannel.appendLine('=== End ===\n');
}

function startServer(context) {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Open a workspace folder before starting the MCP server.');
    return;
  }
  if (serverProcess) {
    vscode.window.showInformationMessage('MCP server is already running.');
    return;
  }
  const serverCmd = getServerCommand(workspaceRoot);
  if (!serverCmd) {
    vscode.window.showErrorMessage('Cannot find package.json in the workspace root.');
    return;
  }

  const nodeModulesPath = path.join(workspaceRoot, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    vscode.window.showWarningMessage('Dependencies are not installed. Run npm install in the workspace before starting the server.');
  }

  serverProcess = cp.spawn(serverCmd.command, serverCmd.args, serverCmd.options);
  log(`Starting MCP server in ${workspaceRoot}`);
  vscode.window.showInformationMessage('Starting MCP Atlassian server...');

  serverProcess.stdout.on('data', (chunk) => log(chunk.toString()));
  serverProcess.stderr.on('data', (chunk) => log(chunk.toString()));
  serverProcess.on('exit', (code, signal) => {
    log(`MCP server exited with code ${code}${signal ? ` signal ${signal}` : ''}`);
    serverProcess = null;
  });
}

function stopServer() {
  if (!serverProcess) {
    vscode.window.showInformationMessage('No MCP server is currently running.');
    return;
  }
  serverProcess.kill();
  vscode.window.showInformationMessage('Stopping MCP server...');
}

function openHealthEndpoint() {
  openUrl('/_health');
}

function openServer() {
  openUrl('');
}

function copyEndpoint() {
  const { serverUrl } = getConfig();
  vscode.env.clipboard.writeText(serverUrl);
  vscode.window.showInformationMessage(`MCP server endpoint copied to clipboard: ${serverUrl}`);
}

async function openArgoOps() {
  const { argoUrl } = getConfig();
  try {
    const response = await fetch(argoUrl, { method: 'HEAD' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    vscode.env.openExternal(vscode.Uri.parse(argoUrl));
  } catch (err) {
    vscode.window.showWarningMessage(`Argo Ops not reachable at ${argoUrl}. Starting port-forward...`);
    startArgoPortForward();
  }
}

function startArgoPortForward() {
  if (argoPortForwardTerminal) {
    vscode.window.showInformationMessage('Argo port-forward is already running in a terminal.');
    argoPortForwardTerminal.show(true);
    return;
  }

  argoPortForwardTerminal = vscode.window.createTerminal({ name: 'Argo CD Port Forward' });
  argoPortForwardTerminal.sendText('kubectl port-forward svc/argocd-server -n argocd 8080:443');
  argoPortForwardTerminal.show(true);
  vscode.window.showInformationMessage('Starting Argo CD port-forward on localhost:8080. Leave the terminal open.');
}

async function postServerConfig(path, body) {
  const { serverUrl } = getConfig();
  const url = `${serverUrl}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to configure server: ${response.status} ${response.statusText} - ${text}`);
  }
  return response.json();
}

async function setConfluencePat() {
  const base = await askRequiredInput('Confluence base URL', 'e.g. https://your-domain.atlassian.net');
  const email = await askRequiredInput('Confluence email', 'Atlassian user email');
  const token = await askRequiredInput('Confluence API token', 'Enter your Confluence API token');
  await postServerConfig('/config/confluence', { base, email, token });
  vscode.window.showInformationMessage('Confluence configuration saved to the MCP server.');
}

async function setGhcrPat() {
  const pat = await askRequiredInput('GHCR Personal Access Token', 'Enter GHCR PAT with `packages: write` scope');
  if (!extensionContext) throw new Error('Extension context not available');
  await extensionContext.secrets.store('GHCR_PAT', pat);
  vscode.window.showInformationMessage('GHCR PAT saved to VS Code Secret Storage.');
}

async function setGithubPat() {
  const pat = await askRequiredInput('GitHub Personal Access Token', 'Enter GitHub PAT (repo/packages scopes as needed)');
  if (!extensionContext) throw new Error('Extension context not available');
  await extensionContext.secrets.store('GITHUB_PAT', pat);
  vscode.window.showInformationMessage('GitHub PAT saved to VS Code Secret Storage.');
}

async function setJiraPat() {
  const base = await askRequiredInput('Jira base URL', 'e.g. https://your-domain.atlassian.net');
  const email = await askRequiredInput('Jira email', 'Atlassian user email');
  const token = await askRequiredInput('Jira API token', 'Enter your Jira API token');
  await postServerConfig('/config/jira', { base, email, token });
  vscode.window.showInformationMessage('Jira configuration saved to the MCP server.');
}

async function setArgoUrl() {
  const argoUrl = await askRequiredInput('Argo Ops dashboard URL', 'e.g. http://localhost:8080');
  await vscode.workspace.getConfiguration('mcpAtlassian').update('argoUrl', argoUrl, vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage(`Argo Ops URL saved: ${argoUrl}`);
}

async function readConfluencePage() {
  const space = await askRequiredInput('Confluence space key', 'e.g. DOCS');
  const title = await askRequiredInput('Confluence page title', 'e.g. Architecture Overview');
  const result = await callMcp(`/confluence/page?space=${encodeURIComponent(space)}&title=${encodeURIComponent(title)}`);
  showResultInOutput(`Confluence page: ${space}/${title}`, result);
  vscode.window.showInformationMessage('Confluence page loaded into the MCP output channel.');
}

async function updateConfluencePage() {
  const id = await askInput('Confluence page ID (leave blank to look up by space/title)', 'page id');
  let pageId = id;
  if (!pageId) {
    const space = await askRequiredInput('Confluence space key', 'e.g. DOCS');
    const title = await askRequiredInput('Confluence page title', 'e.g. Architecture Overview');
    const page = await callMcp(`/confluence/page?space=${encodeURIComponent(space)}&title=${encodeURIComponent(title)}`);
    if (!page || !page.id) {
      throw new Error('Page not found.');
    }
    pageId = page.id;
  }
  const storage = await askRequiredInput('New page storage content', 'Enter new HTML/XML storage body');
  const title = await askInput('New page title (optional)', 'Leave blank to keep existing title');
  const result = await callMcp(`/confluence/page/${encodeURIComponent(pageId)}`, {
    method: 'PUT',
    body: { storage, title }
  });
  showResultInOutput(`Updated Confluence page ${pageId}`, result);
  vscode.window.showInformationMessage('Confluence page updated successfully.');
}

async function searchConfluencePages() {
  const cql = await askRequiredInput('Confluence CQL search query', 'e.g. type=page AND title~"Design"');
  const result = await callMcp(`/confluence/search?cql=${encodeURIComponent(cql)}`);
  showResultInOutput(`Confluence search: ${cql}`, result);
  vscode.window.showInformationMessage('Confluence search results loaded into the MCP output channel.');
}

async function readJiraIssue() {
  const key = await askRequiredInput('Jira issue key', 'e.g. PROJ-123');
  const result = await callMcp(`/jira/issue/${encodeURIComponent(key)}`);
  showResultInOutput(`Jira issue: ${key}`, result);
  vscode.window.showInformationMessage('Jira issue loaded into the MCP output channel.');
}

async function updateJiraIssue() {
  const key = await askRequiredInput('Jira issue key', 'e.g. PROJ-123');
  const fieldsJson = await askInput('Issue fields JSON (optional)', 'e.g. {"summary":"New title"}');
  let body = {};
  if (fieldsJson) {
    try {
      body = JSON.parse(fieldsJson);
    } catch (err) {
      throw new Error('Invalid JSON for issue fields.');
    }
  } else {
    const summary = await askInput('New summary (optional)', 'Leave blank to keep current');
    const description = await askInput('New description (optional)', 'Leave blank to keep current');
    if (summary) body.summary = summary;
    if (description) body.description = description;
  }
  if (!Object.keys(body).length) {
    throw new Error('No update fields provided.');
  }
  const result = await callMcp(`/jira/issue/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: { fields: body }
  });
  showResultInOutput(`Updated Jira issue: ${key}`, result);
  vscode.window.showInformationMessage('Jira issue update request sent.');
}

async function searchJiraIssues() {
  const jql = await askRequiredInput('Jira JQL query', 'e.g. project = PROJ AND status = "To Do"');
  const maxResults = await askInput('Max results', '50');
  const limit = parseInt(maxResults || '50', 10) || 50;
  const result = await callMcp(`/jira/search?jql=${encodeURIComponent(jql)}&maxResults=${encodeURIComponent(limit)}`);
  showResultInOutput(`Jira search: ${jql}`, result);
  vscode.window.showInformationMessage('Jira search results loaded into the MCP output channel.');
}

function createMcpViewItem(label, command, tooltip) {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.command = { command, title: label };
  item.tooltip = tooltip;
  return item;
}

class McpViewProvider {
  getTreeItem(element) {
    return element;
  }

  getChildren() {
    return [
      createMcpViewItem('Start MCP server', 'mcpAtlassian.startServer', 'Start the local MCP server'),
      createMcpViewItem('Stop MCP server', 'mcpAtlassian.stopServer', 'Stop the local MCP server'),
      createMcpViewItem('Open MCP root', 'mcpAtlassian.openServer', 'Open the MCP server root endpoint'),
      createMcpViewItem('Open MCP health', 'mcpAtlassian.openHealth', 'Open the MCP server health endpoint'),
      createMcpViewItem('Open Argo Ops', 'mcpAtlassian.openArgoOps', 'Open your Argo operations dashboard'),
      createMcpViewItem('Start Argo port-forward', 'mcpAtlassian.startArgoPortForward', 'Start kubectl port-forward for Argo CD on localhost:8080'),
      createMcpViewItem('Set Argo URL', 'mcpAtlassian.setArgoUrl', 'Save your Argo Ops dashboard URL for future launches'),
      createMcpViewItem('Copy MCP endpoint', 'mcpAtlassian.copyEndpoint', 'Copy the MCP server endpoint to clipboard'),
      createMcpViewItem('Set Confluence PAT', 'mcpAtlassian.setConfluencePat', 'Store your Confluence personal access token securely'),
      createMcpViewItem('Set Jira PAT', 'mcpAtlassian.setJiraPat', 'Store your Jira personal access token securely'),
      createMcpViewItem('Set GHCR PAT', 'mcpAtlassian.setGhcrPat', 'Store your GitHub Container Registry PAT securely'),
      createMcpViewItem('Set GitHub PAT', 'mcpAtlassian.setGithubPat', 'Store your GitHub PAT securely for repo actions'),
      createMcpViewItem('Read Confluence page', 'mcpAtlassian.readConfluencePage', 'Fetch a Confluence page using space and title'),
      createMcpViewItem('Update Confluence page', 'mcpAtlassian.updateConfluencePage', 'Update the content or title of a Confluence page'),
      createMcpViewItem('Search Confluence pages', 'mcpAtlassian.searchConfluencePages', 'Search Confluence pages with CQL'),
      createMcpViewItem('Read Jira issue', 'mcpAtlassian.readJiraIssue', 'Fetch a Jira issue by key'),
      createMcpViewItem('Update Jira issue', 'mcpAtlassian.updateJiraIssue', 'Send updates to a Jira issue'),
      createMcpViewItem('Search Jira issues', 'mcpAtlassian.searchJiraIssues', 'Search Jira issues with JQL')
    ];
  }
}

function activate(context) {
  outputChannel = vscode.window.createOutputChannel('MCP Atlassian');
  extensionContext = context;

  context.subscriptions.push(
    vscode.commands.registerCommand('mcpAtlassian.startServer', () => startServer(context)),
    vscode.commands.registerCommand('mcpAtlassian.stopServer', stopServer),
    vscode.commands.registerCommand('mcpAtlassian.openHealth', openHealthEndpoint),
    vscode.commands.registerCommand('mcpAtlassian.copyEndpoint', copyEndpoint),
    vscode.commands.registerCommand('mcpAtlassian.openServer', openServer),
    vscode.commands.registerCommand('mcpAtlassian.openArgoOps', openArgoOps),
    vscode.commands.registerCommand('mcpAtlassian.startArgoPortForward', startArgoPortForward),
    vscode.commands.registerCommand('mcpAtlassian.setArgoUrl', setArgoUrl),
    vscode.commands.registerCommand('mcpAtlassian.setConfluencePat', setConfluencePat),
    vscode.commands.registerCommand('mcpAtlassian.setJiraPat', setJiraPat),
    vscode.commands.registerCommand('mcpAtlassian.setGhcrPat', setGhcrPat),
    vscode.commands.registerCommand('mcpAtlassian.setGithubPat', setGithubPat),
    vscode.commands.registerCommand('mcpAtlassian.readConfluencePage', readConfluencePage),
    vscode.commands.registerCommand('mcpAtlassian.updateConfluencePage', updateConfluencePage),
    vscode.commands.registerCommand('mcpAtlassian.searchConfluencePages', searchConfluencePages),
    vscode.commands.registerCommand('mcpAtlassian.readJiraIssue', readJiraIssue),
    vscode.commands.registerCommand('mcpAtlassian.updateJiraIssue', updateJiraIssue),
    vscode.commands.registerCommand('mcpAtlassian.searchJiraIssues', searchJiraIssues),
    vscode.window.registerTreeDataProvider('mcpAtlassianView', new McpViewProvider())
  );

  const config = vscode.workspace.getConfiguration('mcpAtlassian');
  if (config.get('autoStart', false)) {
    setTimeout(() => startServer(context), 500);
  }
}

function deactivate() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

module.exports = { activate, deactivate };