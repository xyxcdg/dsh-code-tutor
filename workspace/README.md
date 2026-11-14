# 学习工作区（workspace）

一个文件夹，五种语言，点一下就能跑；右边还有 AI 老师随时讲解。

## 怎么运行
- 打开任意 `.py / .js / .cpp / .java`，点右上角 **▶**（Code Runner）运行，输出在底部「终端」。
- 需要键盘输入的程序（如 Python 的 `input()`），在终端里直接打字回车。
- 断点单步调试：按 **F5**，选对应语言的配置。

## 目录
- `python/`  Python 入门（hello.py）
- `java/`    Java 入门（Hello.java，public 类名要和文件名一致）
- `cpp/`     C++ 入门（hello.cpp）
- `node/`    Node.js 入门（hello.js）
- `web/`     网页入门（index.html）
- `test/`    小练习（sum.c：1+2+…+10）

## 在 VS Code 里问 AI 老师
- **边写边讲**：改完代码按 `Ctrl+S` 保存，约 2~3 秒后右侧「洄·讲解」自动从最基础讲这个文件。
- **整文件讲解**：`Ctrl+Alt+E`；**只讲选中几行**：`Ctrl+Alt+Shift+E`。
- **直接提问**：按 `Ctrl+Alt+Q`，在编辑器最右侧打开 DSH 聊天窗口，打字问就行。

## 提示
- 新文件直接放进对应语言目录即可。
- C/C++ 默认用 g++ 编译（需要 MinGW 在 PATH）；用 MSVC 的话改 `.vscode` 里的编译器路径。
