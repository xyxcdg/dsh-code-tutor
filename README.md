# dsh-code-tutor · 让智能体陪你学编程的 VS Code 学习工作区

一个「拿来就能学」的编程学习环境：**你写代码，AI 老师在旁边从最基础讲「这行为什么这么写」**，遇到不懂的随时在一个内嵌窗口里问它。

它由两部分组成：

- **学习工作区**（`workspace/`）：Python / Java / C / C++ / Node.js / 前端网页，五种语言各有一个 ``hello`` 示例，点右上角 ▶ 就能跑，F5 就能调试。
- **VS Code 扩展**（`extension/`）：把你自己电脑上的「DSH 智能体」接进 VS Code——
  - **洄·讲解**：保存代码（或按 `Ctrl+Alt+E`）后，右侧面板自动用中文从最基础讲一遍：这段想做什么 → 逐行看懂（①在做什么 ②为什么必须这么写 ③不写会怎样）→ 涉及的基础概念 → 一个更小的例子 → 怎么自己验证。
  - **DSH 问答窗口**：按 `Ctrl+Alt+Q`，在编辑器**最右侧**打开一个完整的 DSH 聊天界面（就是你本机那个智能体），想怎么问就怎么问。

> 关键点：它**不依赖某个特定的人**。扩展调用的是**你自己电脑上安装的 DeepSeek Harness（DSH）**，所以你拉下这个项目、装好，替你讲解的就是你自己的那个智能体。

---

## 一、先决条件

| 需要 | 说明 |
|---|---|
| **DeepSeek Harness（DSH）** | 必须已安装并配好可用的模型（能正常对话）。讲解和问答都靠它。默认安装路径或 PATH 里能找到 `dsh.cmd` 即可，找不到时在 VS Code 设置里填 `dshWindow.dshPath`。|
| **VS Code** | 1.80 以上。|
| 语言工具链（按需） | 只想学 Python：装 Python 即可；学 Java 要 JDK；学 C/C++ 要 gcc/g++（MinGW）；Node 要 Node.js。见「四、各语言环境」。|

## 二、三步用起来

**第 1 步：拿到项目**
```
git clone <本仓库地址> dsh-code-tutor
```
（或在 GitHub 页面上点 `Code → Download ZIP` 解压。）

**第 2 步：安装**
双击 `install\install.cmd`。它会：
1. 把 VS Code 扩展装进 `%USERPROFILE%\.vscode\extensions\dsh-window-<版本>`；
2. 把学习工作区复制到 `%USERPROFILE%\Documents\Learn-Tutor`（已存在则跳过，不覆盖你改过的代码）；
3. 尝试用 `code` 命令帮你装推荐扩展（Code Runner / Python / C++ / Java）；没装 `code` 就打印手动安装清单。

**第 3 步：打开开始学**
用 VS Code 打开 `Documents\Learn-Tutor` 文件夹，然后：
- 打开任意 `.py / .java / .cpp / .js`，点右上角 **▶** 运行；
- 改完代码按 **`Ctrl+S`** 保存 → 右侧「洄·讲解」自动弹出讲解；
- 想直接问 → 按 **`Ctrl+Alt+Q`** 打开最右侧的 DSH 问答窗口。

## 三、怎么用（不擅长快捷键也能用）

**最省心 —— 只要会 `Ctrl+S`：** 打开任意代码文件，改完按 `Ctrl+S` 保存，2~3 秒后右侧自动弹出「洄·讲解」，从头把这个文件讲一遍。这是**默认行为**，不用做任何设置。

**右下角状态栏有两个按钮，鼠标点即可（不用记任何快捷键）：**

| 状态栏按钮 | 点一下会怎样 |
|---|---|
| 📖 **自动讲解：开 / 关** | 显示当前是否开启，点一下切换。关掉后保存就不再自动讲解。 |
| 💬 **讲这个文件** | 立刻从最基础讲解当前文件（不用等保存）。 |

**给喜欢键盘的人准备的快捷键（可选）：**

| 操作 | 快捷键 | 说明 |
|---|---|---|
| 打开 DSH 问答窗口（聊天） | `Ctrl+Alt+Q` | 在编辑器最右侧打开，直接打字提问 |
| 讲解当前整个文件 | `Ctrl+Alt+E` | 同「讲这个文件」按钮 |
| 只讲解选中的几行 | `Ctrl+Alt+Shift+E` | 或右键 →「讲解选中代码」 |
| 保存时自动讲解 开/关 | 命令面板搜「开关：保存时自动讲解」 | 默认开；同状态栏按钮 |

> 一句话：**平时只要会 `Ctrl+S` 就够了**，开关和「立即讲」都能用鼠标点状态栏。命令面板 = `Ctrl+Shift+P`，搜「洄」或「讲解」也能找到全部命令。

## 四、各语言环境（按需安装）

- **Python**：装 [Python](https://www.python.org/)，`python` 在 PATH 即可。VS Code 装 `ms-python.python`。
- **Node.js**：装 [Node.js](https://nodejs.org/)，`node` 在 PATH。调试内置，无需额外扩展。
- **Java**：装 JDK 17+，`javac`/`java` 在 PATH。VS Code 装 `vscjava.vscode-java-pack`（提供 `jdk` 调试类型）。
- **C / C++**：装 MinGW-w64，确保 `gcc`/`g++`/`gdb` 在 PATH。VS Code 装 `ms-vscode.cpptools`。
- 运行按钮（右上角 ▶）用的是 `formulahendry.code-runner`。

> 本工作区默认用 **g++** 编译 C/C++，这样换电脑最省事。若你本机用 MSVC（cl.exe），把 `.vscode/tasks.json`、`launch.json`、`c_cpp_properties.json` 里的 `g++`/`gdb` 换成你的编译器路径即可。

## 五、目录结构

```
dsh-code-tutor/
├─ extension/           VS Code 扩展源码（dsh-window）
│  ├─ extension.js
│  └─ package.json
├─ workspace/           学习工作区（复制到你电脑上用）
│  ├─ .vscode/          settings / launch / tasks / c_cpp_properties
│  ├─ python/  java/  cpp/  node/  web/  test/
│  └─ README.md
├─ install/
│  ├─ install.cmd       双击入口
│  └─ install.ps1       实际安装逻辑
├─ LICENSE
└─ README.md
```

## 六、它是怎么工作的

- 扩展是一个**本地未打包扩展**（纯 JS，零 npm 依赖）。安装脚本只是把它复制进 VS Code 的扩展目录，VS Code 启动即加载。
- 讲解：把当前文件/选区拼成一段「请当入门老师逐行讲」的提示，用 `dsh --profile headless --json` 跑一次，把返回的 Markdown 渲染到右侧面板。
- 问答窗口：扩展内部用 `dsh web --port 5678 --no-open` 起一个本地 DSH 网页服务，再用 VS Code 的 Simple Browser 内嵌，并停靠到编辑器最右侧。
- 全程只在本机跑，不联网到第三方（网络只用于 DSH 自己连模型）。

## 七、常见问题

- **讲解一直「正在讲解…」**：多半是找不到 `dsh`。确认 DSH 已安装、能对话；在 VS Code 设置搜 `dshWindow.dshPath`，填 `dsh.cmd` 的完整路径（形如 `C:\Users\你\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd`）。
- **`Ctrl+Alt+Q` 打开是空白页**：重启 VS Code 后旧标签会失效，再按一次 `Ctrl+Alt+Q` 即可（会拿到新地址）。
- **▶ 运行报「找不到 python/g++/javac」**：对应语言工具链没装或没进 PATH，见「四、各语言环境」。
- **右侧没有「洄·讲解」面板**：点右下角状态栏的「💬 讲这个文件」，或按一次 `Ctrl+Alt+E`，就会把它叫出来。
- **看不到右下角两个按钮**：确认扩展已加载（重载窗口）；窗口太窄时状态栏会隐藏在 `…` 里。

## 许可证

MIT，见 [LICENSE](LICENSE)。
