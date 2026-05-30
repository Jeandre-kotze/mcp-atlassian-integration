# GitHub Webhook Setup for Argo CD

## Step 1: Generate Webhook Secret

Generate a random secret for webhook authentication:

```bash
openssl rand -base64 32
```

Save this secret; you'll use it for both GitHub and Argo CD.

## Step 2: Create Kubernetes Secret for GitHub Webhook

```bash
kubectl create secret generic github-webhook-secret \
  --from-literal=token=YOUR_GENERATED_SECRET \
  -n argocd
```

## Step 3: Configure Argo CD Notification

Create `argocd-notifications-cm` ConfigMap in the `argocd` namespace:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  trigger.on-sync-failed: |
    - when: sync.phase in ['Error'] and sync.operationPhase in ['Error']
      oncePer: app.status.operationState.finishedAt
      send: [app-sync-failed]
  trigger.on-sync-succeeded: |
    - when: sync.phase in ['Succeeded'] and sync.operationPhase in ['Succeeded']
      oncePer: app.status.operationState.finishedAt
      send: [app-sync-succeeded]
```

## Step 4: Add Repository Webhook in GitHub

1. Go to your repository: https://github.com/Jeandre-kotze/mcp-atlassian-integration
2. **Settings** → **Webhooks** → **Add webhook**
3. Set:
   - **Payload URL**: `http://argocd-server/api/webhook`
   - **Content type**: `application/json`
   - **Secret**: (paste your generated secret from Step 1)
   - **Events**: Select **Push events**
4. Click **Add webhook**

## Step 5: Update Argo CD Application Webhook (Optional)

If you want Argo CD to automatically sync on push without waiting for Image Updater:

In the Argo CD Application spec, add:

```yaml
spec:
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

This is already configured in `k8s/argocd-application.yaml`.

## Verification

1. Make a test push to the repository:
   ```bash
   git commit --allow-empty -m "Test webhook"
   git push origin main
   ```

2. Check Argo CD for a sync event (should appear in the application timeline)

3. Verify the webhook was received:
   - Go to **GitHub** → **Repository Settings** → **Webhooks**
   - Click on the webhook
   - Check **Recent Deliveries** tab for successful delivery (HTTP 200)

## How It Works

1. You push code to GitHub
2. GitHub Actions builds a new Docker image and pushes to GHCR with tag `sha-{COMMIT_SHA}`
3. Argo Image Updater detects the new image tag (every 30 seconds)
4. Argo Image Updater updates the deployment manifest in Git with the new image tag
5. Argo CD detects the Git change and auto-syncs the deployment
6. Kubernetes pulls the new image and updates the pods

## Troubleshooting

### Webhook not triggering
- Verify the webhook URL is correct: `http://argocd-server/api/webhook`
- Check GitHub webhook delivery logs for error responses
- Ensure Argo CD is accessible from GitHub's IP ranges (for cloud-hosted Argo CD)

### Argo Image Updater not updating
- Verify Image Updater pods are running: `kubectl get pods -n argocd | grep image-updater`
- Check logs: `kubectl logs -n argocd deployment/argocd-image-updater`
- Ensure the application has image update annotations

### Images not syncing
- Verify GHCR image exists: `docker pull ghcr.io/jeandre-kotze/mcp-atlassian-integration:latest`
- Check Argo CD application status: `argocd app get mcp-atlassian`
