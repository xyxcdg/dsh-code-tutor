# dsh-window · VS Code 扩展（学习讲解 + 一键运行）

把 AI 老师接进 VS Code：右侧「洄·讲解」面板从最基础讲解你正在写的代码；一个按钮自动认出语言、自动挑编译器把代码跑起来。

## 状态栏按钮（不用记快捷键）

打开 VS Code 后，**右下角状态栏**有 6 个可点的按钮：

- ▶ **运行** —— 自动识别当前文件语言、自动挑编译器，在终端里编译并运行。
- 💬 **讲这个文件** —— 立刻从最基础讲解当前文件。
- 🐞 **我卡住了** —— 看看你现在写到哪、有没有错、下一步写什么。
- 🗨 **提问** —— 把光标移到右侧「洄·讲解」面板最下面的输入框，打字提问、回车发送（秒级回答，不用开浏览器）。
- 📖 **自动讲解：开 / 关** —— 点一下切换保存时是否自动讲解（默认「开」）。

## 自动识别语言

新建 / 未保存 / `.txt` 文件也能用：写了内容后自动判断语言（Python / C / C++ / Java / JS / Go / Rust / HTML / CSS / SQL…），文档语言与「运行」都跟着对。认不出时提示先保存成带后缀的文件。

## 命令（命令面板 `Ctrl+Shift+P`）

| 命令 | 标题 | 快捷键 |
|---|---|---|
| `dshWindow.ask` | 提问（在「洄·讲解」面板里问基础问题） | `Ctrl+Alt+Q` |
| `dshWindow.open` | 打开完整 DSH 问答窗口（进阶，需要 dsh web 与鉴权） | — |
| `dshWindow.run` | 运行当前文件（自动挑编译器） | `Ctrl+Alt+R` |
| `dshWindow.explainFile` | 讲解当前文件（从基础） | `Ctrl+Alt+E` |
| `dshWindow.explainSelection` | 讲解选中代码（从基础） | `Ctrl+Alt+Shift+E` |
| `dshWindow.stuck` | 我卡住了 | `Ctrl+Alt+H` |
| `dshWindow.detectLanguage` | 识别当前文件是什么语言 | — |
| `dshWindow.toggleExplainOnSave` | 开关：保存时自动讲解 | — |
| `dshWindow.setupAI` | 设置AI（选讲解用的接口） | — |

## 设置

| 设置项 | 默认 | 说明 |
|---|---|---|
| `dshWindow.gatewayUrl` | `http://127.0.0.1:3425/v1/chat/completions` | 任意 OpenAI 兼容的 `/v1/chat/completions` 地址。可换成本机网关 / OpenAI / DeepSeek / 本地 Ollama。|
| `dshWindow.apiKey` | `""` | 上面接口需要的密钥（可选；本机 Magpie 不用填）。|
| `dshWindow.model` | `auto/deepseek-v4.1-flash` | 讲解用的模型 id。|
| `dshWindow.useGateway` | `true` | 为否时改走 `dsh` 命令行。|
| `dshWindow.dshPath` | `""` | `dsh.cmd` 完整路径；留空自动在默认安装位置与 PATH 里找。|
| `dshWindow.explainOnSave` | `true` | 保存代码文件时自动讲解（同一文件内容没变不重复讲）。|
| `dshWindow.autoOpenPanel` | `true` | 常驻：打开工作区时自动在右侧显示「洄·讲解」面板，重启 VS Code 后自动恢复。|
| `dshWindow.explainWhileTyping` | `false` | 边写边讲：停手约 2.5 秒后自动看写到哪（默认关，打开会覆盖掉「基础讲解」；只在走网关时生效）。|

## 安装（手动）

把整个 `extension` 文件夹复制到：

```
%USERPROFILE%\.vscode\extensions\dsh-window-<版本>
```

然后重启（或「开发者: 重新加载窗口」）VS Code。仓库根的 `一键安装.cmd` 会自动完成这一步。

## 依赖

- **运行 / 编译 / 语言识别**：只要本机装了对应语言的编译器/解释器（在 PATH 里），无需任何 AI。
- **讲解 / 问答**：需要一个 OpenAI 兼容接口（`gatewayUrl`），或本机 DSH（`dshPath`）。都没有时给出配置提示，不影响运行。
