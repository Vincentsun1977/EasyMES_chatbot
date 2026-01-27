<#
Build, optionally push, and save Docker image (PowerShell).

Examples:
  # Build and save
  pwsh -File scripts\build-image.ps1 -ImageName chatbot-app -Tag v1.0 -SavePath chatbot-app-v1.0.tar

  # Build, push and save
  pwsh -File scripts\build-image.ps1 -ImageName chatbot-app -Tag v1.0 -Registry myregistry.example.com/myrepo -Push -SavePath chatbot-app-v1.0.tar
#>

param(
    [string]$ImageName = 'chatbot-app',
    [string]$Tag = 'latest',
    [string]$SavePath = 'chatbot-app.tar',
    [string]$Registry = '',
    [switch]$Push
)

try {
    if ($Registry -ne '') { $FullTag = "$Registry/$ImageName:$Tag" } else { $FullTag = "$ImageName:$Tag" }

    Write-Host "Building image: $FullTag"
    docker build -t $FullTag -f Dockerfile .
    if ($LASTEXITCODE -ne 0) { throw 'docker build failed' }

    if ($Push.IsPresent) {
        if ($Registry -eq '') { throw 'Registry must be provided when using -Push' }
        Write-Host "Pushing image: $FullTag"
        docker push $FullTag
        if ($LASTEXITCODE -ne 0) { throw 'docker push failed' }
    }

    Write-Host "Saving image to: $SavePath"
    docker save -o $SavePath $FullTag
    if ($LASTEXITCODE -ne 0) { throw 'docker save failed' }

    Write-Host "Done. Image available as: $FullTag and saved at $SavePath"
    exit 0
}
catch {
    Write-Error $_
    exit 1
}
