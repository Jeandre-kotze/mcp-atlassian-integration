const axios = require('axios');

function getJiraConfig() {
  const base = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!base || !email || !token) throw new Error('Missing Jira config in environment');
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  return { base, auth };
}

async function callJira(path, options = {}) {
  const { base, auth } = getJiraConfig();
  const url = `${base}${path}`;
  const headers = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' };
  const response = await axios({ url, headers, ...options });
  return response.data;
}

async function getProjects() {
  return callJira('/rest/api/3/project/search', { params: { maxResults: 50 } });
}

async function getIssue(key) {
  return callJira(`/rest/api/3/issue/${encodeURIComponent(key)}`);
}

async function searchIssues(jql, maxResults = 50) {
  return callJira('/rest/api/3/search', { params: { jql, maxResults } });
}

async function createIssue(payload) {
  return callJira('/rest/api/3/issue', { method: 'post', data: payload });
}

async function updateIssue(key, payload) {
  return callJira(`/rest/api/3/issue/${encodeURIComponent(key)}`, { method: 'put', data: payload });
}

async function addComment(key, body) {
  return callJira(`/rest/api/3/issue/${encodeURIComponent(key)}/comment`, { method: 'post', data: { body } });
}

module.exports = {
  getProjects,
  getIssue,
  searchIssues,
  createIssue,
  updateIssue,
  addComment
};
