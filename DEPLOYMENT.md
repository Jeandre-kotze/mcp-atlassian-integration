# Deployment Guide

This guide walks you through deploying the MCP Atlassian integration to your Kubernetes cluster using Argo CD.

## Prerequisites

- Kubernetes cluster with Argo CD installed
- GitHub repository access (already set up)
- Confluence and Jira API credentials
- Docker registry with GHCR (GitHub Container Registry)

## Step 1: Add GitHub Secrets for Argo CD

To enable the GitHub Actions workflow to deploy to your Argo CD instance, add the following secrets to your GitHub repository:

1. Go to **Settings** > **Secrets and variables** > **Actions**
2. Add these secrets:

| Secret Name | Description | Example |
|---|---|---|
| `ARGOCD_SERVER` | Your Argo CD server URL | `https://argocd.your-domain.com` |
| `ARGOCD_USERNAME` | Argo CD login username | `admin` |
| `ARGOCD_PASSWORD` | Argo CD login password | (your Argo CD admin password) |

## Step 2: Create Kubernetes Secrets for Atlassian Credentials

In your Kubernetes cluster, create the `mcp-atlassian-secrets` secret:

```bash
kubectl create secret generic mcp-atlassian-secrets \
  --from-literal=confluenceBaseUrl=https://your-domain.atlassian.net \
  --from-literal=confluenceEmail=your.email@example.com \
  --from-literal=confluenceApiToken=YOUR_CONFLUENCE_PAT \
  --from-literal=jiraBaseUrl=https://your-domain.atlassian.net \
  --from-literal=jiraEmail=your.email@example.com \
  --from-literal=jiraApiToken=YOUR_JIRA_API_TOKEN \
  -n default
```

## Step 3: Create GHCR Image Pull Secret (Optional)

If your cluster is private or GHCR images require authentication:

```bash
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_GITHUB_PAT \
  --docker-email=your.email@github.com \
  -n default
```

Then add to the deployment:

```yaml
spec:
  template:
    spec:
      imagePullSecrets:
        - name: ghcr-secret
```

## Step 4: Deploy with Argo CD

Apply the Argo CD application manifest to your cluster:

```bash
kubectl apply -f k8s/argocd-application.yaml
```

Or if using Argo CD CLI:

```bash
argocd app create -f k8s/argocd-application.yaml --upsert
argocd app sync mcp-atlassian
```

## Step 5: Verify the Deployment

```bash
# Check application status in Argo CD
argocd app get mcp-atlassian

# Verify pod is running
kubectl get pods -l app=mcp-atlassian

# Check service
kubectl get svc mcp-atlassian

# Test the health endpoint
kubectl port-forward svc/mcp-atlassian 3000:3000 &
curl http://localhost:3000/_health
```

## Step 6: Trigger GitHub Actions

Push a commit to the `main` branch to trigger the CI/CD workflow:

```bash
git commit --allow-empty -m "Trigger CI/CD workflow"
git push origin main
```

The workflow will:
1. Build the Docker image
2. Push to GitHub Container Registry (GHCR)
3. Deploy to your Kubernetes cluster via Argo CD

## Monitoring

### Check workflow runs
Visit: https://github.com/Jeandre-kotze/mcp-atlassian-integration/actions

### Check Argo CD sync status
```bash
argocd app wait mcp-atlassian --health
```

### View logs
```bash
kubectl logs -l app=mcp-atlassian -f
```

## Troubleshooting

### Image pull errors
If you see `ImagePullBackOff`, ensure the GHCR image pull secret is configured correctly.

### Argo CD sync failures
Check the Argo CD logs:
```bash
kubectl logs -n argocd deployment/argocd-application-controller
```

### Deployment pod errors
Check pod logs:
```bash
kubectl logs -l app=mcp-atlassian
```

## API Endpoints

Once deployed, the service is accessible at:
- `http://mcp-atlassian.default.svc.cluster.local:3000` (internal)
- Health check: `http://mcp-atlassian:3000/_health`
- Confluence endpoints: `/confluence/*`
- Jira endpoints: `/jira/*`

See `README.md` for full API documentation.
