# 学习讲解 + 一键运行 · VS Code 学习工作区

一个「拿来就能学」的编程学习环境：**你写代码，AI 老师在旁边从最基础讲「这行为什么这么写」；点一个按钮就自动认出语言、自动挑编译器把代码跑起来。**

它由两部分组成：

- **学习工作区**（`workspace/`）：Python / Java / C / C++ / Node.js / 前端网页，多种语言各有一个 `hello` 示例，点按钮就能跑。
- **VS Code 扩展**（`extension/`）：
  - **讲这个文件 / 我卡住了**：右侧面板用中文从最基础讲解——这段想做什么 → 逐行看懂（①在做什么 ②为什么必须这么写 ③不写会怎样）→ 基础概念 → 更小的例子 → 怎么自己验证；「我卡住了」会看你现在写到哪、有没有错、**下一步写什么**。
  - **运行**：自动识别当前文件是什么语言，自动在 PATH 里挑对应的编译器/解释器，在终端里编译并运行。
  - **提问**：在编辑器最右侧打开问答窗口，直接打字问。

> 关键点：**它不绑定某个特定的人或某个特定软件。** 「讲解」可以接**任意 OpenAI 兼容的 AI 接口**（本机网关、OpenAI、DeepSeek、本地 Ollama 都行），也可以接你本机的 DSH。不配 AI 时，**运行、编译、语言识别照常可用**。

---

## 一、先决条件

| 需要 | 说明 |
|---|---|
| **VS Code** | 1.80 以上。安装脚本会自动装好扩展。 |
| 语言工具链（按需） | 学哪门装哪门：Python≈装 Python；Java≈装 JDK 17+；C/C++≈装 MinGW-w64（gcc/g++）；Node≈装 Node.js；Go/Rust 同理。装完重启 VS Code。 |
| AI 讲解（可选） | 二选一：①任意 OpenAI 兼容接口（在设置里填 `dshWindow.gatewayUrl` + `dshWindow.model`，需要密钥再填 `dshWindow.apiKey`）；②本机装了 DSH（把 `dshWindow.dshPath` 指到 `dsh.cmd`）。不配也能正常跑代码。 |

## 二、两步装好（给同学的极简版）

**第 1 步：拿到项目** —— 在 GitHub 页面点 `Code → Download ZIP` 解压（或 `git clone`）。

**第 2 步：双击仓库根目录的 `一键安装.cmd`。** 它会自动：
1. 把 VS Code 扩展装进 `%USERPROFILE%\.vscode\extensions\dsh-window-<版本>`（先清掉旧版本，避免冲突）；
2. 把学习工作区复制到 `%USERPROFILE%\Documents\Learn-Tutor`（已存在则跳过，不覆盖你写的代码）；
3. 检查本机 Python / Node / Java / gcc / g++ / Go / Rust 装了没有（打印一张清单，没有就按提示装）；
4. 尝试用 `code` 命令帮你装推荐扩展（Code Runner / Python / C++ / Java）；
5. 自动用 VS Code 打开学习文件夹。

装完就能用，不用改任何配置。

> 也可以双击 `install\install.cmd`（功能一样，只是不自动打开 VS Code）。

## 三、怎么用（只用鼠标，不用记快捷键）

打开任意代码文件后，看 VS Code **右下角状态栏**，鼠标点即可：

| 状态栏按钮 | 点一下会怎样 |
|---|---|
| ▶ **运行** | 自动认出当前文件的语言、自动挑编译器，在终端里编译并运行（C/C++/Java 会先编译再跑）。 |
| 💬 **讲这个文件** | 立刻从最基础讲解当前文件。 |
| 🐞 **我卡住了** | 看看你现在写到哪、有没有错、下一步写什么。 |
| 🗨 **提问** | 打开右侧问答窗口，直接问基础问题。 |
| 📖 **自动讲解：开/关** | 打开时，保存代码后自动讲解；点一下切换。 |

**新建文件随便写也不用管后缀**：你把内容一写（或一保存），扩展会自动识别是哪种语言（Python / C / C++ / Java / JS / Go / Rust / HTML / CSS / SQL…），高亮和「运行」都跟着对。认不出时会提示你先保存成带后缀的文件（`.py`、`.c`、`.cpp`…）。

**给喜欢键盘的人（可选）：**

| 操作 | 快捷键 |
|---|---|
| 打开问答窗口 | `Ctrl+Alt+Q` |
| 运行当前文件 | `Ctrl+Alt+R` |
| 讲解整个文件 | `Ctrl+Alt+E` |
| 讲解选中几行 | `Ctrl+Alt+Shift+E` |
| 我卡住了 | `Ctrl+Alt+H` |

## 四、各语言环境（按需安装）

- **Python**：装 [Python](https://www.python.org/)，`python` 在 PATH。VS Code 装 `ms-python.python`。
- **Node.js**：装 [Node.js](https://nodejs.org/)，`node` 在 PATH。
- **Java**：装 JDK 17+，`javac`/`java` 在 PATH。VS Code 装 `vscjava.vscode-java-pack`。
- **C / C++**：装 MinGW-w64，确保 `gcc`/`g++` 在 PATH（也支持 clang/clang++）。VS Code 装 `ms-vscode.cpptools`。
- **Go / Rust**：装 Go / Rust，`go`/`rustc` 在 PATH。

> 「运行」按钮会按这个顺序在 PATH 里找：C→`gcc`/`clang`，C++→`g++`/`clang++`；找不到会给出明确的安装提示，不会静默失败。

## 五、目录结构

```
dsh-code-tutor/
├─ 一键安装.cmd          双击安装（推荐）
├─ extension/            VS Code 扩展源码（dsh-window）
│  ├─ extension.js
│  └─ package.json
├─ workspace/            学习工作区（复制到你电脑上用）
│  ├─ .vscode/           settings / launch / tasks / c_cpp_properties
│  ├─ python/  java/  cpp/  node/  web/  test/
│  └─ README.md
├─ install/
│  ├─ install.cmd        双击入口（不自动开 VS Code）
│  └─ install.ps1        实际安装逻辑（含环境检查）
├─ LICENSE
└─ README.md
```

## 六、它是怎么工作的

- 扩展是一个**本地未打包扩展**（纯 JS，零 npm 依赖）。安装脚本只是复制进 VS Code 扩展目录，启动即加载。
- **讲解**：把当前文件拼成一段「请当入门老师逐行讲」的提示，POST 到 **OpenAI 兼容接口**（`/v1/chat/completions`，流式渲染，首字通常 2~5 秒）；接口不通时自动退回本机 `dsh` 命令行。不配 AI 时给出「怎么配」的说明。
- **运行**：读当前文件内容 → 用规则识别语言（必要时把文档语言也切过去）→ 在 `PATH` 里找对应编译器 → 在集成终端里编译并运行。
- **语言识别**：按最有辨识度的写法判断（`#include`→C/C++、`public static void main`→Java、`def`/`import`/`print(`→Python、`console.log`→JS、`func main`→Go、`fn main`→Rust、`<!DOCTYPE html>`→HTML…），宁可认不出也不猜错。
- 全程只在本机跑；联网只用于你的 AI 接口本身。

## 七、常见问题

- **点「讲这个文件」说还没配置 AI**：在 VS Code 设置搜 `dshWindow.gatewayUrl`，填你的 OpenAI 兼容接口地址（如 `http://127.0.0.1:3425/v1/chat/completions`），再按需填 `dshWindow.model` / `dshWindow.apiKey`；或者把 `dshWindow.dshPath` 指到 `dsh.cmd`。**运行代码不需要这些。**
- **点「运行」说没找到编译器**：对应语言工具链没装或没进 PATH，见「四、各语言环境」；装完重启 VS Code。
- **新建文件识别不出语言**：先按 `Ctrl+S` 保存成带后缀的文件（如 `a.py` / `a.cpp`），或右键用命令「识别当前文件是什么语言」。
- **右侧没有讲解面板**：点右下角「讲这个文件」就会叫出来。
- **看不到底部按钮**：确认扩展已加载（重载窗口）；窗口太窄时状态栏会收进 `…`。

## 许可证

MIT，见 [LICENSE](LICENSE)。
