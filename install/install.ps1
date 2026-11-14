param(
  [string]$WorkspaceDir = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Learn-Tutor')
)
$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent $PSScriptRoot
$extSrc = Join-Path $root 'extension'
$wsSrc  = Join-Path $root 'workspace'

function Log($m){ Write-Host $m }

# 1) 安装 VS Code 扩展（复制到扩展目录）
$pkg = Get-Content (Join-Path $extSrc 'package.json') -Raw | ConvertFrom-Json
$ver = $pkg.version
$extDir = Join-Path $env:USERPROFILE ".vscode\extensions"
$extTarget = Join-Path $extDir ("dsh-window-$ver")
Log "==> 安装 VS Code 扩展到: $extTarget"
if (-not (Test-Path $extDir)) { New-Item -ItemType Directory -Path $extDir -Force | Out-Null }
if (Test-Path $extTarget) { Remove-Item $extTarget -Recurse -Force }
New-Item -ItemType Directory -Path $extTarget -Force | Out-Null
Copy-Item (Join-Path $extSrc '*') $extTarget -Recurse -Force
Log "    完成。"

# 2) 复制学习工作区（已存在则不覆盖）
Log "==> 准备工作区: $WorkspaceDir"
if (Test-Path (Join-Path $WorkspaceDir '.vscode')) {
  Log "    已存在，跳过复制（不覆盖你已有的代码）。"
} else {
  New-Item -ItemType Directory -Path $WorkspaceDir -Force | Out-Null
  Copy-Item (Join-Path $wsSrc '*') $WorkspaceDir -Recurse -Force
  Log "    完成。"
}

# 3) 尝试用 code 命令安装推荐扩展
$code = Get-Command code -ErrorAction SilentlyContinue
if ($code) {
  $exts = @('formulahendry.code-runner','ms-python.python','ms-vscode.cpptools','vscjava.vscode-java-pack')
  foreach($e in $exts){
    Log "==> 安装 VS Code 扩展: $e"
    try { & code --install-extension $e --force | Out-Null } catch { Log "    失败（可稍后在扩展面板手动装）" }
  }
} else {
  Log "==> 没找到 code 命令。请手动在 VS Code 扩展面板安装："
  Log "    Code Runner(formulahendry.code-runner)、Python(ms-python.python)、C/C++(ms-vscode.cpptools)、Java(vscjava.vscode-java-pack)"
}

Log ""
Log "================= 安装完成 ================="
Log "1) 用 VS Code 打开文件夹: $WorkspaceDir"
Log "2) 确认本机已安装并登录 DeepSeek Harness(DSH)，且模型可正常对话"
Log "3) 打开代码文件：Ctrl+S 保存=自动讲解 | Ctrl+Alt+E=讲解整文件 | Ctrl+Alt+Q=最右侧问答窗口"
Log "============================================"
