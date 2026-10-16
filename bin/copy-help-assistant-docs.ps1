# Copies the Metabase docs (markdown only: no images, no developers guide) into
# resources/help_assistant/docs so they ship inside the JAR for the Help page assistant.
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File bin\copy-help-assistant-docs.ps1
$ErrorActionPreference = "Stop"
$src  = Resolve-Path (Join-Path $PSScriptRoot "..\docs")
$dest = Join-Path $PSScriptRoot "..\resources\help_assistant\docs"
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
$count = 0
Get-ChildItem $src -Recurse -Filter *.md |
  Where-Object { $_.FullName -notlike "*\developers-guide\*" } |
  ForEach-Object {
    $rel    = $_.FullName.Substring($src.Path.Length + 1)
    $target = Join-Path $dest $rel
    New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
    Copy-Item $_.FullName $target
    $count++
  }
Write-Host "Copied $count doc pages to $dest"
