const axios = require('axios');

function getConfluenceConfig() {
  const base = process.env.CONFLUENCE_BASE_URL;
  const email = process.env.CONFLUENCE_EMAIL;
  const token = process.env.CONFLUENCE_API_TOKEN;
  if (!base || !email || !token) throw new Error('Missing Confluence config in environment');
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  return { base, auth };
}

async function callConfluence(path, options = {}) {
  const { base, auth } = getConfluenceConfig();
  const url = `${base}/wiki${path}`;
  const headers = { Authorization: `Basic ${auth}` };
  if (options.data) headers['Content-Type'] = 'application/json';
  const response = await axios({ url, headers, ...options });
  return response.data;
}

async function getSpaces() {
  return callConfluence('/rest/api/space', { params: { limit: 50 } });
}

async function getPage(space, title) {
  const result = await callConfluence('/rest/api/content', {
    params: { spaceKey: space, title, expand: 'body.storage,version,ancestors' }
  });
  return result.results && result.results.length ? result.results[0] : null;
}

async function getPageById(id) {
  return callConfluence(`/rest/api/content/${encodeURIComponent(id)}`, {
    params: { expand: 'body.storage,version,ancestors' }
  });
}

async function searchPages(cql) {
  return callConfluence('/rest/api/content/search', {
    params: { cql, expand: 'body.storage,version,space' }
  });
}

async function createPage(space, title, storage, ancestors = []) {
  return callConfluence('/rest/api/content', {
    method: 'post',
    data: {
      type: 'page',
      title,
      space: { key: space },
      ancestors,
      body: { storage: { value: storage, representation: 'storage' } }
    }
  });
}

async function updatePage(id, storage, title) {
  const existing = await getPageById(id);
  const version = existing.version?.number ? existing.version.number + 1 : 2;
  const data = {
    id,
    type: 'page',
    title: title || existing.title,
    version: { number: version },
    body: { storage: { value: storage, representation: 'storage' } }
  };
  return callConfluence(`/rest/api/content/${encodeURIComponent(id)}`, {
    method: 'put',
    data
  });
}

module.exports = {
  getSpaces,
  getPage,
  getPageById,
  searchPages,
  createPage,
  updatePage
};
