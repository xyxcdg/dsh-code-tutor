param(
  [string]$WorkspaceDir = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Learn-Tutor'),
  [switch]$Launch,
  [switch]$SkipExtensions
)
$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent $PSScriptRoot
$extSrc = Join-Path $root 'extension'
$wsSrc  = Join-Path $root 'workspace'

function Log($m){ Write-Host $m }

# 在 PATH 里找可执行文件，返回第一个存在的
function Find-Exe([string[]]$names){
  foreach($n in $names){
    $c = Get-Command $n -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
  }
  return ''
}
function Mark($ok){ if ($ok) { '  [有]' } else { '  [无]' } }

Log "=================================================="
Log "   学习讲解 + 一键运行  安装程序"
Log "=================================================="
Log ""

# 1) 安装 VS Code 扩展（先清掉旧版本，避免重复/冲突）
$pkg = Get-Content (Join-Path $extSrc 'package.json') -Raw | ConvertFrom-Json
$ver = $pkg.version
$extDir = Join-Path $env:USERPROFILE ".vscode\extensions"
$extTarget = Join-Path $extDir ("dsh-window-$ver")
Log "==> [1/3] 安装 VS Code 扩展 -> $extTarget"
if (-not (Test-Path $extDir)) { New-Item -ItemType Directory -Path $extDir -Force | Out-Null }
Get-ChildItem $extDir -Directory -Filter 'dsh-window-*' -ErrorAction SilentlyContinue | ForEach-Object {
  try { Remove-Item $_.FullName -Recurse -Force } catch {}
}
New-Item -ItemType Directory -Path $extTarget -Force | Out-Null
Copy-Item (Join-Path $extSrc '*') $extTarget -Recurse -Force
Log "    完成。"
Log ""

# 2) 复制学习工作区（已存在则不动，保护学生自己写的代码）
Log "==> [2/3] 准备工作区 -> $WorkspaceDir"
if (Test-Path (Join-Path $WorkspaceDir '.vscode')) {
  Log "    已存在，跳过（不覆盖你已有的代码）。"
} else {
  New-Item -ItemType Directory -Path $WorkspaceDir -Force | Out-Null
  Copy-Item (Join-Path $wsSrc '*') $WorkspaceDir -Recurse -Force
  Log "    完成。"
}
Log ""

# 3) 检测本机编译器/解释器（运行代码时用得到）
Log "==> [3/3] 检查本机语言环境（没有也能先用，装上对应软件即可）"
$py   = Find-Exe @('python','py','python3')
$node = Find-Exe @('node')
$javac= Find-Exe @('javac')
$gcc  = Find-Exe @('gcc','clang')
$gpp  = Find-Exe @('g++','clang++')
$go   = Find-Exe @('go')
$rust = Find-Exe @('rustc')
$git  = Find-Exe @('git')
Log ("  Python : " + (Mark $py)   + $(if($py){"  $py"}))
Log ("  Node.js: " + (Mark $node) + $(if($node){"  $node"}))
Log ("  Java   : " + (Mark $javac)+ $(if($javac){"  $javac"}))
Log ("  C(gcc) : " + (Mark $gcc)  + $(if($gcc){"  $gcc"}))
Log ("  C++    : " + (Mark $gpp)  + $(if($gpp){"  $gpp"}))
Log ("  Go     : " + (Mark $go)   + $(if($go){"  $go"}))
Log ("  Rust   : " + (Mark $rust) + $(if($rust){"  $rust"}))
Log ("  Git    : " + (Mark $git)  + $(if($git){"  $git"}))
Log ""
Log "  说明：点『运行』时会自动认语言、自动挑上面这些编译器/解释器。"
Log "  某语言显示 [无] 就装对应软件（Python / Node.js / JDK / MinGW-w64 等），装完重启 VS Code 即可。"
Log ""

# 4) 装推荐扩展（可选，不阻塞）
if (-not $SkipExtensions) {
  $codeCmd = Get-Command code -ErrorAction SilentlyContinue
  if ($codeCmd) {
    $exts = @('formulahendry.code-runner','ms-python.python','ms-vscode.cpptools','vscjava.vscode-java-pack')
    foreach($e in $exts){
      Log "==> 安装 VS Code 扩展推荐: $e"
      try { & code --install-extension $e --force 2>$null | Out-Null } catch { Log "    跳过（可稍后在扩展面板手动装）" }
    }
  } else {
    Log "==> 没找到 code 命令，跳过推荐扩展。稍后可在 VS Code 扩展面板按需安装："
    Log "    Code Runner / Python / C/C++ / Java"
  }
  Log ""
}

# 5) 打开工作区（可选）
if ($Launch) {
  $codeCmd = Get-Command code -ErrorAction SilentlyContinue
  if ($codeCmd) { & code $WorkspaceDir }
  else { Log "没找到 code 命令，请手动用 VS Code 打开：$WorkspaceDir" }
}

Log "================= 安装完成 ================="
Log "打开 VS Code 后，用右下角这几个按钮，全程不用记快捷键："
Log "  · 运行        —— 自动认出语言、自动挑编译器，跑当前文件"
Log "  · 讲这个文件  —— 从最基础讲解整篇代码"
Log "  · 我卡住了    —— 看看你写到哪、哪里错、下一步写什么"
Log "  · 提问        —— 打开问答窗口问基础问题"
Log ""
Log "打开的学习文件夹：$WorkspaceDir"
Log "============================================"
