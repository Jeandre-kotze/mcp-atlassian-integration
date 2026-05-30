const vscode = require('vscode');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');

let serverProcess = null;
let outputChannel;

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
  outputChannel.appendLine(message);
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
  const config = vscode.workspace.getConfiguration('mcpAtlassian');
  const url = config.get('serverUrl', 'http://localhost:3000');
  vscode.env.openExternal(vscode.Uri.parse(`${url}/_health`));
}

function copyEndpoint() {
  const config = vscode.workspace.getConfiguration('mcpAtlassian');
  const url = config.get('serverUrl', 'http://localhost:3000');
  vscode.env.clipboard.writeText(url);
  vscode.window.showInformationMessage(`MCP server endpoint copied: ${url}`);
}

function activate(context) {
  outputChannel = vscode.window.createOutputChannel('MCP Atlassian');

  context.subscriptions.push(
    vscode.commands.registerCommand('mcpAtlassian.startServer', () => startServer(context)),
    vscode.commands.registerCommand('mcpAtlassian.stopServer', stopServer),
    vscode.commands.registerCommand('mcpAtlassian.openHealth', openHealthEndpoint),
    vscode.commands.registerCommand('mcpAtlassian.copyEndpoint', copyEndpoint)
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