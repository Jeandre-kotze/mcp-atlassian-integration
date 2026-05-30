require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const confluence = require('./confluence');
const jira = require('./jira');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

function sendError(res, err) {
  const message = err.response?.data || err.message || 'Unknown error';
  res.status(500).json({ error: message });
}

app.get('/_health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/confluence/spaces', async (req, res) => {
  try {
    const spaces = await confluence.getSpaces();
    res.json(spaces);
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/confluence/page', async (req, res) => {
  const { space, title } = req.query;
  if (!space || !title) return res.status(400).json({ error: 'space and title required' });
  try {
    const page = await confluence.getPage(space, title);
    res.json(page);
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/confluence/page/id/:id', async (req, res) => {
  try {
    const page = await confluence.getPageById(req.params.id);
    res.json(page);
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/confluence/search', async (req, res) => {
  const { cql } = req.query;
  if (!cql) return res.status(400).json({ error: 'cql query required' });
  try {
    const results = await confluence.searchPages(cql);
    res.json(results);
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/confluence/page', async (req, res) => {
  const { space, title, storage, ancestors } = req.body;
  if (!space || !title || !storage) return res.status(400).json({ error: 'space,title,storage required' });
  try {
    const result = await confluence.createPage(space, title, storage, ancestors);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/confluence/page/:id', async (req, res) => {
  const { storage, title } = req.body;
  if (!storage) return res.status(400).json({ error: 'storage required' });
  try {
    const result = await confluence.updatePage(req.params.id, storage, title);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/jira/projects', async (req, res) => {
  try {
    const projects = await jira.getProjects();
    res.json(projects);
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/jira/issue/:key', async (req, res) => {
  try {
    const issue = await jira.getIssue(req.params.key);
    res.json(issue);
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/jira/search', async (req, res) => {
  const { jql, maxResults } = req.query;
  if (!jql) return res.status(400).json({ error: 'jql query required' });
  try {
    const issues = await jira.searchIssues(jql, parseInt(maxResults, 10) || 50);
    res.json(issues);
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/jira/issue', async (req, res) => {
  try {
    const result = await jira.createIssue(req.body);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/jira/issue/:key', async (req, res) => {
  try {
    const result = await jira.updateIssue(req.params.key, req.body);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/jira/issue/:key/comment', async (req, res) => {
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: 'body required' });
  try {
    const result = await jira.addComment(req.params.key, body);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`MCP server listening on ${port}`));
