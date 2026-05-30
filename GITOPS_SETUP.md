# GitHub + Argo CD + Docker Complete Setup

This guide connects your GitHub repository to Argo CD for fully automated GitOps deployments.

## Architecture

```
GitHub Push
    ↓
GitHub Actions (Build & Push to GHCR)
    ↓
Argo Image Updater (Detects new image)
    ↓
Updates deployment in Git
    ↓
Argo CD (Detects Git change)
    ↓
Auto-syncs to Kubernetes
```

## Setup Steps

### 1. Install Argo CD (if not already installed)

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

### 2. Get Argo CD Admin Password

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

### 3. Port-forward to Argo CD (for local access)

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Access at: https://localhost:8080 (username: admin, password from step 2)
```

### 4. Deploy Argo CD Image Updater

This will automatically detect new images and update the deployment:

```bash
kubectl apply -f k8s/argocd-image-updater.yaml
```

Verify it's running:
```bash
kubectl get pods -n argocd | grep image-updater
```

### 5. Create Kubernetes Secrets for Atlassian Credentials

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

### 6. Deploy the Argo CD Application

```bash
kubectl apply -f k8s/argocd-application.yaml
```

Check status:
```bash
argocd app get mcp-atlassian
# or via kubectl
kubectl get application -n argocd
```

### 7. (Optional) Add GitHub Secrets for Direct Argo CD Deployment

If you want GitHub Actions to directly trigger Argo CD syncs (faster than waiting for Image Updater):

In your GitHub repo: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add:
- `ARGOCD_SERVER`: Your Argo CD server URL (e.g., `https://argocd.your-domain.com`)
- `ARGOCD_USERNAME`: `admin`
- `ARGOCD_PASSWORD`: Your Argo CD admin password

The workflow will use these to sync immediately after pushing a new image.

### 8. (Optional) Set Up GitHub Webhook

For even faster syncs (no need to wait for Image Updater's 30-second polling):

1. Go to your repo: https://github.com/Jeandre-kotze/mcp-atlassian-integration
2. **Settings** → **Webhooks** → **Add webhook**
3. Set:
   - **Payload URL**: `https://your-argocd.com/api/webhook`
   - **Content type**: `application/json`
   - **Secret**: (generate one with `openssl rand -base64 32`)
4. **Events**: Push events
5. Click **Add webhook**

Then in GitHub repo secrets, add:
- `ARGOCD_WEBHOOK_URL`: The webhook URL from step 3

## Testing the Complete Pipeline

### Test 1: Push Code and Watch the Pipeline

```bash
# Make a change and push
echo "# Test comment" >> README.md
git add README.md
git commit -m "Test GitOps pipeline"
git push origin main
```

### Test 2: Monitor GitHub Actions

1. Go to: https://github.com/Jeandre-kotze/mcp-atlassian-integration/actions
2. Watch the workflow run
3. See image pushed to GHCR with multiple tags

### Test 3: Monitor Argo CD

```bash
# Check application status
argocd app get mcp-atlassian

# Watch logs
argocd app logs mcp-atlassian

# Check sync status
argocd app get mcp-atlassian --refresh
```

### Test 4: Verify Deployment

```bash
# Check pods
kubectl get pods -l app=mcp-atlassian

# Check which image is running
kubectl get deployment mcp-atlassian -o jsonpath='{.spec.template.spec.containers[0].image}'

# Port-forward to test
kubectl port-forward svc/mcp-atlassian 3000:3000
curl http://localhost:3000/_health
```

## How Image Updates Work

1. **GitHub Actions builds** → Pushes image to GHCR with tags:
   - `latest`
   - `{short-sha}` (e.g., `abc1234`)
   - `{run-number}` (e.g., `42`)

2. **Argo Image Updater** (runs every 30 seconds) → Detects new `latest` image tag

3. **Image Updater updates Git** → Modifies `k8s/deployment.yaml` with new image SHA

4. **Argo CD detects Git change** → Auto-syncs the deployment

5. **Kubernetes pulls new image** → Deploys updated pods

## Troubleshooting

### Image Updater not detecting new images

```bash
# Check Image Updater logs
kubectl logs -n argocd deployment/argocd-image-updater

# Manually trigger an update
kubectl delete pod -n argocd -l app.kubernetes.io/name=argocd-image-updater
```

### Argo CD not syncing

```bash
# Check application status
argocd app get mcp-atlassian

# Force a refresh
argocd app sync mcp-atlassian --force

# Check Argo CD server logs
kubectl logs -n argocd deployment/argocd-application-controller
```

### Deployment not updating

```bash
# Check if new pods are created
kubectl get pods -l app=mcp-atlassian -o wide

# Check pod logs
kubectl logs -l app=mcp-atlassian -f

# Check deployment status
kubectl describe deployment mcp-atlassian
```

### Image pull errors

```bash
# Verify image exists
docker pull ghcr.io/jeandre-kotze/mcp-atlassian-integration:latest

# Check image pull secret (if needed for private registry)
kubectl get secrets -n default | grep docker
```

## Production Recommendations

1. **Use Git ops without secrets in workflows**: Only Image Updater needs access; it reads Git directly
2. **Set up branch protection**: Require code reviews before merge to `main`
3. **Use semantic versioning**: Tag releases with proper version numbers
4. **Monitor Argo CD**: Set up alerts for sync failures
5. **Use RBAC**: Limit Argo CD and Image Updater service account permissions
6. **Backup configurations**: Keep backups of Kubernetes manifests

## Quick Reference

| Component | What it does | How often |
|-----------|-------------|-----------|
| GitHub Actions | Build & push Docker image | On every push to main |
| Argo Image Updater | Detect new images, update Git | Every 30 seconds |
| Argo CD | Sync Git state to Kubernetes | Automatically when Git changes |

## Next Steps

1. Configure your Argo CD server URL, username, and password as GitHub secrets
2. Deploy the Argo CD Image Updater
3. Create the Argo CD Application
4. Push a test commit and watch the full pipeline
