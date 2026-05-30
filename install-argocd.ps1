# install-argocd.ps1
# Run this script after you have a valid Kubernetes context configured.

Write-Host "Checking kubectl availability..."
if (-not (Test-Path .\kubectl.exe)) {
  Write-Error "kubectl.exe not found in the workspace. Download it first or add it to PATH."
  exit 1
}

$kubectl = Join-Path (Get-Location) 'kubectl.exe'

Write-Host "Current kubectl context:"
& $kubectl config current-context
if ($LASTEXITCODE -ne 0) {
  Write-Error "No current Kubernetes context. Please configure your kubeconfig and try again."
  exit 1
}

Write-Host "Creating argocd namespace..."
& $kubectl create namespace argocd --dry-run=client -o yaml | & $kubectl apply -f -

Write-Host "Installing Argo CD into the cluster..."
& $kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
if ($LASTEXITCODE -ne 0) {
  Write-Error "Failed to install Argo CD. Check the kubectl output above."
  exit 1
}

Write-Host "Waiting for Argo CD server deployment to be ready..."
& $kubectl -n argocd rollout status deployment/argocd-server --timeout=180s
if ($LASTEXITCODE -ne 0) {
  Write-Error "Argo CD server rollout failed or timed out."
  exit 1
}

Write-Host "Argo CD installation complete."
Write-Host "You can access the server after configuring port-forwarding or ingress."
Write-Host "Run './argocd.exe login <ARGOCD_SERVER> --username admin --password <password>' to log in."
