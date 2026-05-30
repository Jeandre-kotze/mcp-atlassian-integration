# MCP Atlassian Integration (Confluence & Jira)

This repository is a minimal HTTP server that exposes simple endpoints to read/write Confluence pages and read/create Jira issues. It's suitable as an MCP-style context bridge for local development.

Prerequisites
- Node.js 18+ and npm

Quick start
1. Copy `.env.example` to `.env` and set your Atlassian cloud base URL, email, and API tokens.
2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
npm start
```

API endpoints
- Health: `GET /_health`
- Confluence: `GET /confluence/page?space=SPACE&title=TITLE`
- Confluence create/update: `POST /confluence/page` with JSON `{ "space": "SPACE", "title": "Title", "storage": "<p>HTML or storage format</p>" }`
- Jira: `GET /jira/issue/:key`
- Jira create: `POST /jira/issue` with Jira issue JSON payload (see Jira API docs)

Security & creds
- Do not commit `.env` or real tokens. Use a secrets manager for production.
- The example uses Basic auth with email + API token for Atlassian Cloud.

VS Code / MCP integration
1. Run the server locally (default `http://localhost:3000`).
2. In tools that support Model Context Protocol or external context servers, point the MCP URL to your running server.
3. A VS Code extension is included in `extension/` to start the local MCP server and open or copy the endpoint.

## VS Code extension
1. Open the `extension/` folder as a workspace or use the Extension Development Host from VS Code.
2. Run the command `MCP Atlassian: Start Server` to launch the local MCP server.
3. Use `MCP Atlassian: Open Health Endpoint` to verify the server is running.
4. The default MCP endpoint is `http://localhost:3000` and is configurable in settings under `mcpAtlassian.serverUrl`.

## Docker and Kubernetes deployment

### Docker
- Build the image:

```bash
npm install
npm run docker-build
```

- Run locally with the environment file:

```bash
npm run docker-run
```

### Docker Compose

```bash
docker compose up --build
```

### Kubernetes
- Apply the deployment, service, and secret manifests:

```bash
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/argocd-application.yaml
```

- The service exposes port `3000` internally. Use a Kubernetes ingress or port-forwarding to access it externally.

## GitHub Actions + Argo CD
- A GitHub Actions workflow is available at `.github/workflows/ci-cd.yaml`.
- It builds the Docker image, pushes it to your registry, and uses Argo CD to sync your application.
- Required GitHub secrets:
  - `DOCKER_REGISTRY`
  - `DOCKER_USERNAME`
  - `DOCKER_PASSWORD`
  - `ARGOCD_SERVER`
  - `ARGOCD_USERNAME`
  - `ARGOCD_PASSWORD`

- Your Argo CD application manifest is available at `k8s/argocd-application.yaml`.

## Atlassian tool coverage
- Confluence
  - List spaces
  - Get page by title or ID
  - Search pages via CQL
  - Create page
  - Update page
- Jira
  - List projects
  - Get issue details
  - Search issues via JQL
  - Create issue
  - Update issue
  - Add comments

## Security note
- Never commit real API tokens or PATs into source control.
- Use `.env` locally and Kubernetes secrets for cloud deployments.
