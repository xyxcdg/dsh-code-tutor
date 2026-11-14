# dsh-window · VS Code 扩展

把本机的 DeepSeek Harness（DSH）智能体接进 VS Code：右侧「洄·讲解」面板自动从最基础讲解你正在写的代码，外加一个可停靠到编辑器最右侧的 DSH 聊天窗口。

## 状态栏按钮（不用记快捷键）

打开 VS Code 后，**右下角状态栏**有两个可点的按钮：

- 📖 **自动讲解：开 / 关** —— 点一下切换保存时是否自动讲解（默认「开」）。
- 💬 **讲这个文件** —— 点一下立刻讲解当前文件。

所以平时只用 `Ctrl+S` 保存即可自动讲解，无需记任何快捷键。

## 命令（命令面板 `Ctrl+Shift+P`）

| 命令 | 标题 | 快捷键 |
|---|---|---|
| `dshWindow.open` | DSH: 打开问答窗口 | `Ctrl+Alt+Q` |
| `dshWindow.explainFile` | 洄: 讲解当前文件（从基础） | `Ctrl+Alt+E` |
| `dshWindow.explainSelection` | 洄: 讲解选中代码（从基础） | `Ctrl+Alt+Shift+E` |
| `dshWindow.toggleExplainOnSave` | 洄: 开关：保存时自动讲解 | — |

## 设置

| 设置项 | 默认 | 说明 |
|---|---|---|
| `dshWindow.dshPath` | `""` | `dsh.cmd` 完整路径；留空自动在默认安装位置与 PATH 里找。|
| `dshWindow.explainOnSave` | `true` | 保存代码文件时自动讲解（同一文件内容没变不重复讲）。|

## 安装（手动）

把整个 `extension` 文件夹复制到：

```
%USERPROFILE%\.vscode\extensions\dsh-window-0.0.3
```

然后重启（或「开发者: 重新加载窗口」）VS Code。

## 依赖

- 本机已安装 DeepSeek Harness（DSH）并配好可用模型。
- 讲解走 `dsh --profile headless --json`；问答窗口走 `dsh web --port 5678`。
