'use strict';
const vscode = require('vscode');
const { spawn, execSync } = require('child_process');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 5678;

// 找到本机的 dsh 命令行入口：优先设置里的 dshWindow.dshPath，其次默认安装位置，
// 最后在 PATH 里找。这样换一台电脑（别人 clone 走）不用改代码。
function resolveDsh() {
  try {
    const cfg = vscode.workspace.getConfiguration('dshWindow').get('dshPath', '');
    if (cfg && fs.existsSync(cfg)) return cfg;
  } catch (e) {}
  const candidates = [];
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness', 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd'));
  if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, 'DeepSeek Harness', 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd'));
  const envPath = process.env.PATH || '';
  for (const dir of envPath.split(path.delimiter)) { if (dir) candidates.push(path.join(dir, 'dsh.cmd')); }
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  return '';
}

let webChild = null;
let urlPromise = null;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    let done = false;
    const finish = (v) => { if (done) return; done = true; try { s.destroy(); } catch (e) {} resolve(v); };
    s.on('connect', () => finish(true));
    s.on('error', () => finish(false));
    s.setTimeout(900, () => finish(false));
  });
}

function killPort(port) {
  try {
    const out = execSync('netstat -ano -p tcp', { encoding: 'utf8', windowsHide: true });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (line.indexOf(':' + port) === -1) continue;
      if (!/LISTENING/i.test(line)) continue;
      const m = line.trim().match(/(\d+)\s*$/);
      if (m) pids.add(m[1]);
    }
    for (const pid of pids) {
      try { execSync('taskkill /pid ' + pid + ' /T /F', { windowsHide: true }); } catch (e) {}
    }
  } catch (e) {}
}

function startServer() {
  return new Promise((resolve, reject) => {
    const dsh = resolveDsh();
    if (!dsh) { reject(new Error('没有找到 dsh 命令；请在设置里把 dshWindow.dshPath 指向 dsh.cmd')); return; }
    const p = spawn('"' + dsh + '" web --port ' + PORT + ' --no-open', { shell: true, windowsHide: true });
    webChild = p;
    let url = null;
    let buf = '';
    const onData = (d) => {
      buf += d.toString();
      const m = buf.match(/dsh web:\s+(http:\/\/\S+)/);
      if (m && !url) { url = m[1].trim(); resolve(url); }
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('error', reject);
    p.on('exit', () => { if (!url) resolve(null); });
    setTimeout(() => { if (!url) resolve(null); }, 30000);
  });
}

function ensureUrl() {
  if (urlPromise) return urlPromise;
  urlPromise = (async () => {
    if (await portInUse(PORT)) { killPort(PORT); await sleep(700); }
    const u = await startServer();
    if (!u) throw new Error('未能从 dsh 输出里解析出网址');
    return u;
  })();
  return urlPromise.catch((e) => { urlPromise = null; throw e; });
}

/* ---------------- 洄·讲解 侧栏 ---------------- */

let panel = null;
let activeRun = 0;
let activeProc = null;
let curStatus = '洄·讲解';
let curMd = '*在编辑器里写代码，保存后这里会自动从最基础讲解；也可以按 Ctrl+Alt+E 讲当前文件、选中代码按 Ctrl+Alt+Shift+E。*';
const saveTimers = new Map();
const typingTimers = new Map();
const lastHash = new Map();
const CODE_LANGS = new Set(['python','java','c','cpp','c++','javascript','javascriptreact','typescript','typescriptreact','html','css','scss','less','csharp','go','rust','vue','svelte','json','sql','kotlin','swift','php','ruby']);
// 不再用「语言白名单」挡人：新建的未保存文件（languageId=plaintext、没有扩展名）也要能讲。
// 只排除明显不是代码的只读面板，其余只看「里面有没有内容」。
const SKIP_LANGS = new Set(['log','output','search-result','vscode','settings','debug','git','scminput','notebook','jsonc']);

function isExplainable(doc) {
  if (!doc) return false;
  try { if (doc.uri.scheme !== 'file' && doc.uri.scheme !== 'untitled') return false; } catch (e) { return false; }
  if (SKIP_LANGS.has(doc.languageId)) return false;
  let t = '';
  try { t = doc.getText(); } catch (e) { return false; }
  return t.trim().length >= 6;
}

// 代码块标记用：plaintext / 未保存新文件统一按 text 处理，避免 ```plaintext 这种怪标记。
function langHint(doc) {
  const l = doc && doc.languageId;
  if (!l || l === 'plaintext') return 'text';
  return l;
}

function fileLabel(doc) {
  try { return (doc.fileName || '').split(/[\\/]/).pop() || 'untitled'; } catch (e) { return 'untitled'; }
}

// 在 PATH 里找一个可执行文件（不用 powershell，避免卡主线程）。
function findOnPath(names) {
  const exts = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean);
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const n of names) {
    for (const d of dirs) {
      for (const e of exts) {
        const p = path.join(d, n + e);
        try { if (fs.existsSync(p)) return p; } catch (_) {}
      }
      try { const bare = path.join(d, n); if (fs.existsSync(bare) && fs.statSync(bare).isFile()) return bare; } catch (_) {}
    }
  }
  return '';
}

// 从代码内容猜语言：给「新建的未保存文件」「.txt 里随便写」用。
// 刻意只认最有辨识度的写法，宁可猜不出（返回空）也不要猜错。
function detectLanguage(text) {
  const t = String(text || '');
  if (!t.trim()) return '';
  if (/^#!.*\bpython[0-9.]*/m.test(t)) return 'python';
  if (/^#!.*\bnode\b/m.test(t)) return 'javascript';
  if (/^#!.*\b(ba)?sh\b/m.test(t)) return 'shellscript';
  if (/<\?php/.test(t)) return 'php';
  if (/#include\s*[<"]/.test(t)) {
    if (/\bstd::|using\s+namespace|cout\s*<<|cin\s*>>|#include\s*<iostream>/.test(t)) return 'cpp';
    return 'c';
  }
  if (/\bpublic\s+(final\s+)?(class|interface|enum)\s+\w+|\bpublic\s+static\s+void\s+main\b|System\.out\.print/.test(t)) return 'java';
  if (/<!DOCTYPE\s+html|<html[\s>]|<body[\s>]/i.test(t)) return 'html';
  if (/\bfunc\s+main\s*\(|\bpackage\s+main\b|fmt\.(Print|Println|Sprintf)/.test(t)) return 'go';
  if (/\bfn\s+main\s*\(|println!\(|\blet\s+mut\s+/.test(t)) return 'rust';
  if (/\bdef\s+\w+\s*\(|\bif\s+__name__\s*==|^\s*(from\s+\w+\s+import|import\s+\w+)/m.test(t)) return 'python';
  if (/\bprint\s*\(/.test(t) && !/\bconsole\.(log|error|warn)\b|\bfunction\b|=>/.test(t)) return 'python';
  if (/\bconsole\.(log|error|warn)\b|\brequire\s*\(|\bmodule\.exports\b|\bconst\s+\w+\s*=|\blet\s+\w+\s*=|=>\s*\{/.test(t)) return 'javascript';
  if (/^\s*(\.|#)?[\w-]+\s*\{[^}]*:[^}]*\}/m.test(t) || /:\s*(color|margin|padding|display|flex|background)\b/.test(t)) return 'css';
  if (/\bSELECT\b[\s\S]+\bFROM\b/i.test(t)) return 'sql';
  if (/\bputs\s+|\bdef\s+\w+[\s\S]*\bend\b/.test(t)) return 'ruby';
  return '';
}

// 未保存/纯文本文件：能猜出语言就把它标成对应语言（让高亮、运行都对）。
function maybeAutoDetect(doc) {
  try {
    if (!doc) return;
    const scheme = doc.uri && doc.uri.scheme;
    if (scheme !== 'file' && scheme !== 'untitled') return;
    const cur = doc.languageId;
    if (cur && cur !== 'plaintext') return;
    const t = doc.getText();
    if (!t || t.trim().length < 4) return;
    const lang = detectLanguage(t);
    if (lang) { Promise.resolve(vscode.languages.setTextDocumentLanguage(doc, lang)).catch(() => {}); }
  } catch (e) {}
}

const EXT_BY_LANG = { python: '.py', javascript: '.js', java: '.java', c: '.c', cpp: '.cpp', go: '.go', rust: '.rs', php: '.php', ruby: '.rb', html: '.html', css: '.css', sql: '.sql', shellscript: '.sh' };

// 按语言自动挑编译器/解释器，给出可直接在终端跑的一条命令。
function buildRunCommand(lang, file) {
  const dir = path.dirname(file);
  const base = path.basename(file);
  const stem = base.replace(/\.[^.\\/]+$/, '');
  const q = (s) => '"' + s + '"';
  switch (lang) {
    case 'python': { const t = findOnPath(['python', 'py', 'python3']); return t ? { command: q(t) + ' -u ' + q(file) } : { error: '没找到 Python，请先安装 Python 并重启 VS Code。' }; }
    case 'javascript': case 'javascriptreact': { const t = findOnPath(['node']); return t ? { command: q(t) + ' ' + q(file) } : { error: '没找到 Node.js，请先安装 Node.js。' }; }
    case 'java': { const jc = findOnPath(['javac']); const jr = findOnPath(['java']); if (!jc || !jr) return { error: '没找到 JDK（javac/java），请安装 JDK 17+。' }; return { command: 'cd /d ' + q(dir) + ' && ' + q(jc) + ' -encoding UTF-8 ' + q(base) + ' && ' + q(jr) + ' ' + q(stem) }; }
    case 'c': { const t = findOnPath(['gcc', 'clang']); if (!t) return { error: '没找到 C 编译器（gcc / clang），请安装 MinGW-w64 并加入 PATH。' }; const exe = path.join(dir, stem + '.exe'); return { command: 'cd /d ' + q(dir) + ' && ' + q(t) + ' ' + q(base) + ' -o ' + q(exe) + ' && ' + q(exe) }; }
    case 'cpp': case 'c++': { const t = findOnPath(['g++', 'clang++']); if (!t) return { error: '没找到 C++ 编译器（g++ / clang++），请安装 MinGW-w64 并加入 PATH。' }; const exe = path.join(dir, stem + '.exe'); return { command: 'cd /d ' + q(dir) + ' && ' + q(t) + ' ' + q(base) + ' -o ' + q(exe) + ' && ' + q(exe) }; }
    case 'go': { const t = findOnPath(['go']); return t ? { command: 'cd /d ' + q(dir) + ' && ' + q(t) + ' run ' + q(base) } : { error: '没找到 Go，请安装 Go。' }; }
    case 'rust': { const t = findOnPath(['rustc']); if (!t) return { error: '没找到 rustc，请安装 Rust。' }; const exe = path.join(dir, stem + '.exe'); return { command: 'cd /d ' + q(dir) + ' && ' + q(t) + ' ' + q(base) + ' -o ' + q(exe) + ' && ' + q(exe) }; }
    case 'php': { const t = findOnPath(['php']); return t ? { command: q(t) + ' ' + q(file) } : { error: '没找到 PHP。' }; }
    case 'ruby': { const t = findOnPath(['ruby']); return t ? { command: q(t) + ' ' + q(file) } : { error: '没找到 Ruby。' }; }
    case 'html': return { command: 'start "" ' + q(file) };
    default: return { error: '' };
  }
}

// 「运行当前文件」：不依赖 Code Runner，自动认语言、自动挑编译器。
async function runCurrent() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) { vscode.window.showInformationMessage('请先打开一个代码文件，再点运行。'); return; }
  const doc = ed.document;
  if (doc.isUntitled) { vscode.window.showInformationMessage('请先按 Ctrl+S 保存一次（保存成 .py/.c/.cpp/.java/.js 之类），再点运行。'); return; }
  let lang = doc.languageId;
  if (!lang || lang === 'plaintext') {
    lang = detectLanguage(doc.getText());
    if (lang) { try { await vscode.languages.setTextDocumentLanguage(doc, lang); } catch (e) {} }
  }
  const spec = buildRunCommand(lang, doc.fileName);
  if (spec.error) { vscode.window.showInformationMessage(spec.error || '没认出这是什么语言，先保存成带后缀的文件再运行。'); return; }
  const term = vscode.window.createTerminal({ name: '运行 ' + path.basename(doc.fileName) });
  term.show(true);
  term.sendText(spec.command);
}

const PANEL_HTML = String.raw`<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  body{font-family:var(--vscode-font-family,system-ui);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:0;margin:0;}
  #hint{position:sticky;top:0;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border,#3a3a3a);padding:8px 14px;font-size:12px;color:var(--vscode-descriptionForeground,#999);z-index:2;}
  #content{padding:8px 18px 48px;line-height:1.75;font-size:14px;max-width:920px;}
  h1,h2,h3,h4{color:var(--vscode-foreground);line-height:1.3;margin:1.1em 0 .5em;}
  h2{font-size:1.2em;border-bottom:1px solid var(--vscode-panel-border,#3a3a3a);padding-bottom:.25em;}
  h3{font-size:1.05em;}
  p{margin:.5em 0;}
  ul,ol{margin:.4em 0 .4em 1.4em;padding:0;}
  li{margin:.28em 0;}
  code{background:var(--vscode-textCodeBlock-background,#2a2a2a);padding:1px 5px;border-radius:4px;font-family:var(--vscode-editor-font-family,Consolas,monospace);font-size:.92em;}
  pre{background:var(--vscode-textCodeBlock-background,#1e1e1e);padding:12px 14px;border-radius:8px;overflow:auto;}
  pre code{background:none;padding:0;}
  strong{color:var(--vscode-textLink-foreground,#4ea1ff);}
  blockquote{border-left:3px solid var(--vscode-textLink-foreground,#4ea1ff);margin:.6em 0;padding:.2em .9em;color:var(--vscode-descriptionForeground,#aaa);}
</style></head>
<body>
<div id="hint">洄·讲解</div>
<div id="content"></div>
<script>
var vscode=acquireVsCodeApi();
var contentEl=document.getElementById('content');
var hintEl=document.getElementById('hint');
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function inline(s){
  s=esc(s);
  s=s.replace(/\x60([^\x60]+)\x60/g,function(_,c){return '<code>'+c+'</code>';});
  s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  return s;
}
function mdToHtml(md){
  var lines=md.split(/\r?\n/);
  var out='';var inCode=false;var codeBuf=[];var listType=null;
  function closeList(){if(listType){out+='</'+listType+'>';listType=null;}}
  for(var i=0;i<lines.length;i++){
    var ln=lines[i];
    if(/^\x60\x60\x60/.test(ln)){
      if(!inCode){inCode=true;codeBuf=[];}else{inCode=false;out+='<pre><code>'+esc(codeBuf.join('\n'))+'</code></pre>';}
      continue;
    }
    if(inCode){codeBuf.push(ln);continue;}
    if(/^\s*$/.test(ln)){closeList();continue;}
    var m;
    if((m=ln.match(/^(#{1,6})\s+(.*)$/))){closeList();var lvl=m[1].length;out+='<h'+lvl+'>'+inline(m[2])+'</h'+lvl+'>';continue;}
    if((m=ln.match(/^\s*[-*]\s+(.*)$/))){if(listType!=='ul'){closeList();out+='<ul>';listType='ul';}out+='<li>'+inline(m[1])+'</li>';continue;}
    if((m=ln.match(/^\s*\d+\.\s+(.*)$/))){if(listType!=='ol'){closeList();out+='<ol>';listType='ol';}out+='<li>'+inline(m[1])+'</li>';continue;}
    if((m=ln.match(/^>\s?(.*)$/))){closeList();out+='<blockquote>'+inline(m[1])+'</blockquote>';continue;}
    closeList();
    out+='<p>'+inline(ln)+'</p>';
  }
  if(inCode){out+='<pre><code>'+esc(codeBuf.join('\n'))+'</code></pre>';}
  closeList();
  return out;
}
window.addEventListener('message',function(e){
  var m=e.data||{};
  if(m.type==='update'){contentEl.innerHTML=mdToHtml(m.markdown||'');}
  else if(m.type==='status'){hintEl.textContent=m.text||'洄·讲解';}
});
vscode.postMessage({type:'ready'});
</script>
</body></html>`;

function wirePanel(p) {
  p.webview.html = PANEL_HTML;
  p.webview.onDidReceiveMessage((msg) => {
    if (msg && msg.type === 'ready' && panel) {
      panel.webview.postMessage({ type: 'status', text: curStatus });
      panel.webview.postMessage({ type: 'update', markdown: curMd });
    }
  });
  p.onDidDispose(() => { panel = null; });
}

function ensurePanel() {
  if (panel) { panel.reveal(vscode.ViewColumn.Beside, true); return panel; }
  panel = vscode.window.createWebviewPanel(
    'dshExplain', '洄·讲解',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true }
  );
  wirePanel(panel);
  return panel;
}

function setStatus(t) { curStatus = t; if (panel) panel.webview.postMessage({ type: 'status', text: t }); }
function setMd(md) { curMd = md; if (panel) panel.webview.postMessage({ type: 'update', markdown: md }); }

function killTree(p) {
  if (!p) return;
  try { spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }); } catch (e) {}
}

// 讲解提示词：四段、限定字数、末尾必须给「下一步你写这个」。
// 字数上限是最有效的提速杠杆——模型少生成一半，等待时间就少一半。
function buildPrompt(code, lang, fileName, label) {
  const clipped = code.length > 12000 ? code.slice(0, 12000) + '\n...（已截断，只讲前面部分）' : code;
  return [
    '你是编程入门老师，讲给刚学编程的新手。用中文 Markdown，固定四段：',
    '',
    '## 这段在做什么',
    '一到两句，说清目的。',
    '',
    '## 关键几行',
    '列表 3~5 条，每条一句：这行在干什么、为什么必须这么写、写错会怎样。',
    '',
    '## 你必须懂的概念',
    '2~4 条，用大白话解释涉及的变量/循环/类型等，不要假设我懂。',
    '',
    '## 下一步你写这个',
    '给一段 5~12 行、可以直接粘贴运行的代码（和上面知识点相关、稍难一点），再用一句话说明为什么练它、写完应该看到什么结果。',
    '',
    '硬要求：正文总共 400 字以内（代码块不计）；不寒暄、不总结段、不重复贴代码全文。',
    '',
    '语言：' + lang + '，文件名：' + fileName + '（' + label + '）',
    '```' + lang,
    clipped,
    '```'
  ].join('\n');
}

// 边写边讲 / 「我卡住了」专用：更短，重点是「有没有写错 + 下一步写什么」。
function buildCoachPrompt(code, lang, fileName, label, mode, cursorLine) {
  const clipped = code.length > 12000 ? code.slice(0, 12000) + '\n...（已截断，只看到前面部分）' : code;
  const where = cursorLine > 0 ? ('我光标停在第 ' + cursorLine + ' 行附近') : '我刚写到这里';
  const head = (mode === 'stuck')
    ? [
        '你是编程入门老师，讲给刚学编程的新手。我现在卡住了：可能写错了，也可能不知道该往下写什么。用中文 Markdown，固定三段：',
        '',
        '## 你现在写到哪',
        '一句话说清我这段代码走到哪一步了。',
        '',
        '## 有没有问题',
        '如果我写错了，直接指出第几行、错在哪、怎么改（给正确写法）；如果没错就写「没问题」。',
        '',
        '## 下一步你写这个',
        '给一段 5~12 行、能直接粘贴运行的代码，再用一句话说明为什么写它、写完应该看到什么结果。',
        '',
        '硬要求：正文总共 300 字以内（代码不计）；不寒暄、不总结、不重复贴我的代码全文。'
      ]
    : [
        '你是编程入门老师，讲给刚学编程的新手。我正在边写边学。用中文 Markdown，固定三段：',
        '',
        '## 你现在写到哪',
        '一句话说清我这段代码在干什么。',
        '',
        '## 有没有问题',
        '只指出明显写错的行（第几行、错在哪、怎么改）；没问题就写「没问题」，不要吹毛求疵。',
        '',
        '## 下一步你写这个',
        '给一段 5~12 行、能直接粘贴运行的代码，再用一句话说明为什么练它、写完应该看到什么结果。',
        '',
        '硬要求：正文总共 260 字以内（代码不计）；不寒暄、不总结、不重复贴我的代码全文。'
      ];
  return head.concat(['', '语言：' + lang + '，文件名：' + fileName + '，' + where + '。', '```' + (lang || 'text'), clipped, '```']).join('\n');
}

const SYS_PROMPT = '你是耐心的编程入门老师，只输出 Markdown，不说多余的话，不寒暄。';

// 直连本机 OpenAI 兼容网关（默认 Magpie 3425）：省略 dsh 进程启动与整包提示词注入，
// 首字约 2 秒；网关不可用时由调用方退回 dsh 命令行。
function gatewayAsk(prompt, onDelta) {
  return new Promise((resolve, reject) => {
    const cfg = vscode.workspace.getConfiguration('dshWindow');
    const rawUrl = String(cfg.get('gatewayUrl', '') || 'http://127.0.0.1:3425/v1/chat/completions').trim();
    const model = String(cfg.get('model', '') || 'auto/deepseek-v4.1-flash').trim();
    const apiKey = String(cfg.get('apiKey', '') || '').trim();
    let u;
    try { u = new URL(rawUrl); } catch (e) { reject(new Error('网关地址无效')); return; }
    const body = JSON.stringify({
      model: model,
      stream: true,
      temperature: 0.3,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: SYS_PROMPT },
        { role: 'user', content: prompt }
      ]
    });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    const req = http.request({
      host: u.hostname,
      port: u.port || 80,
      path: (u.pathname || '/') + (u.search || ''),
      method: 'POST',
      headers: headers
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }
      res.setEncoding('utf8');
      let done = false;
      let buf = '';
      res.on('data', (chunk) => {
        if (done) return;
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (line.indexOf('data:') !== 0) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') { if (!done) { done = true; resolve(); } return; }
          let obj;
          try { obj = JSON.parse(payload); } catch (e) { continue; }
          const ch = obj.choices && obj.choices[0] && obj.choices[0].delta;
          if (ch && typeof ch.content === 'string' && ch.content) onDelta(ch.content);
        }
      });
      res.on('end', () => { if (!done) { done = true; resolve(); } });
      res.on('error', (e) => { if (!done) { done = true; reject(e); } });
    });
    req.setTimeout(20000, () => { req.destroy(new Error('网关超时')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function runExplain(code, lang, fileName, label, mode, cursorLine) {
  const myRun = ++activeRun;
  const started = Date.now();
  if (activeProc) { killTree(activeProc); activeProc = null; }
  ensurePanel();
  const coaching = (mode === 'coach' || mode === 'stuck');
  setStatus(coaching ? '洄在看你写到哪…（2~5 秒）' : '洄正在讲解…（通常 2~5 秒）');
  setMd(coaching ? '*⏳ 正在看你的代码，马上给建议…*' : '*⏳ 正在从最基础讲解，稍等几秒…*');

  const prompt = coaching ? buildCoachPrompt(code, lang, fileName, label, mode, cursorLine || 0) : buildPrompt(code, lang, fileName, label);
  const useGateway = vscode.workspace.getConfiguration('dshWindow').get('useGateway', true);
  if (!useGateway) { runExplainCli(prompt, label, myRun, started); return; }

  let acc = '';
  let lastUpd = 0;
  const onDelta = (c) => {
    acc += c;
    const now = Date.now();
    if (now - lastUpd > 150) {
      lastUpd = now;
      if (myRun === activeRun) { setMd(acc); setStatus('洄正在讲解…'); }
    }
  };

  gatewayAsk(prompt, onDelta).then(() => {
    if (myRun !== activeRun) return;
    if (!acc.trim()) { runExplainCli(prompt, label, myRun, started); return; }
    setMd(acc);
    setStatus('讲解完成 · ' + label + ' · 用 ' + ((Date.now() - started) / 1000).toFixed(1) + ' 秒');
  }).catch((err) => {
    if (myRun !== activeRun) return;
    const why = (err && err.message) ? err.message : String(err);
    setStatus('网关不可用（' + why + '），改用 dsh，会慢一些…');
    runExplainCli(prompt, label, myRun, started);
  });
}

// 退路：原来的 dsh 命令行方式（首字约 60 秒，只在网关不可用时用）
function runExplainCli(prompt, label, myRun, started) {
  // 用「临时 prompt 文件 + launcher.cmd 重定向」把提示喂给 dsh 的 stdin。
  // 不能用 spawn(cmd 字符串, {shell:true}) + p.stdin.write：shell 的 cmd 包裹层吞掉了 stdin，
  // dsh 子进程会一直等 stdin（表现为面板永远停在「正在讲解…」）。
  const stamp = Date.now() + '-' + Math.floor(Math.random() * 1e6);
  const tmpPrompt = path.join(os.tmpdir(), 'dshprompt-' + stamp + '.txt');
  const launcher = path.join(os.tmpdir(), 'dshrun-' + stamp + '.cmd');
  const dsh = resolveDsh();
  if (!dsh) {
    setStatus('还没配置 AI，讲解用不了（运行/编译照常可用）');
    setMd('## 还没配置 AI 讲解\n\n**运行、编译、语言识别都能正常用**，只有「讲这个文件」需要一个 AI 服务。二选一填一下就行：\n\n1. **本地/任意的 OpenAI 兼容接口**：在设置里填 `dshWindow.gatewayUrl`（例如 `http://127.0.0.1:3425/v1/chat/completions`）和 `dshWindow.model`，需要密钥再填 `dshWindow.apiKey`。\n2. **本机装了 DSH**：把 `dshWindow.dshPath` 指到 `dsh.cmd`，就会自动走它。\n\n填完保存，再点「讲这个文件」即可。');
    return;
  }
  try {
    fs.writeFileSync(tmpPrompt, prompt, 'utf8');
    fs.writeFileSync(launcher, '@echo off\r\n"' + dsh + '" --profile headless --json < "' + tmpPrompt + '"\r\n', 'ascii');
  } catch (e) { setStatus('出错：' + e.message); return; }
  const p = spawn('cmd.exe', ['/d', '/s', '/c', launcher], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  activeProc = p;
  const cleanupTmp = () => {
    try { fs.unlinkSync(tmpPrompt); } catch (e) {}
    try { fs.unlinkSync(launcher); } catch (e) {}
  };
  let acc = '';
  let buf = '';
  let lastUpd = 0;

  const flush = (force) => {
    const now = Date.now();
    if (force || now - lastUpd > 250) {
      lastUpd = now;
      if (myRun === activeRun) { setMd(acc); setStatus('洄正在讲解…'); }
    }
  };

  p.stdout.on('data', (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line || line[0] !== '{') continue;
      let obj;
      try { obj = JSON.parse(line); } catch (e) { continue; }
      if (obj.type === 'text' && typeof obj.text === 'string') { acc += obj.text; flush(false); }
      else if (obj.type === 'final') { if (!acc && typeof obj.text === 'string') acc = obj.text; flush(true); }
    }
  });
  p.stderr.on('data', () => {});
  p.on('error', (e) => { cleanupTmp(); if (myRun === activeRun) setStatus('出错：' + e.message); });
  p.on('exit', (code) => {
    cleanupTmp();
    if (myRun !== activeRun) return;
    activeProc = null;
    if (acc.trim()) {
      setMd(acc);
      setStatus('讲解完成 · ' + label + ' · 用 ' + ((Date.now() - (started || Date.now())) / 1000).toFixed(1) + ' 秒');
    } else {
      setMd('*讲解没有返回内容（退出码 ' + code + '）。点右下角「讲这个文件」重试。*');
      setStatus('未返回内容');
    }
  });
}

function explain(scope) {
  const ed = vscode.window.activeTextEditor;
  if (!ed) { vscode.window.showInformationMessage('请先打开一个文件，再让我讲解。'); return; }
  const doc = ed.document;
  if (!isExplainable(doc)) { vscode.window.showInformationMessage('这个文件不是代码、或者内容太少，先不讲解。'); return; }
  let text;
  let label;
  if (scope === 'selection' && ed.selection && !ed.selection.isEmpty) {
    text = doc.getText(ed.selection);
    label = '选中代码';
  } else {
    text = doc.getText();
    label = '当前文件';
  }
  if (!text || !text.trim()) { vscode.window.showInformationMessage('没有可讲解的内容。'); return; }
  maybeAutoDetect(doc);
  let lang = langHint(doc);
  if (lang === 'text') { const d = detectLanguage(text); if (d) lang = d; }
  runExplain(text, lang, fileLabel(doc), label);
}

// 边写边讲 / 「我卡住了」：只给「写到哪 + 有没有错 + 下一步写什么」，比整篇讲解短。
function coach(mode) {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return;
  const doc = ed.document;
  if (!isExplainable(doc)) return;
  const text = doc.getText();
  if (!text || !text.trim()) return;
  maybeAutoDetect(doc);
  let lang = langHint(doc);
  if (lang === 'text') { const d = detectLanguage(text); if (d) lang = d; }
  const cursorLine = (ed.selection && ed.selection.active) ? (ed.selection.active.line + 1) : 0;
  const isStuck = (mode === 'stuck');
  runExplain(text, lang, fileLabel(doc), isStuck ? '卡住了' : '边写边讲', isStuck ? 'stuck' : 'coach', cursorLine);
}

// 选 AI 讲解接口：给同学用，点着选，不用手改 JSON。任何 OpenAI 兼容接口都行。
async function setupAI() {
  const cfg = vscode.workspace.getConfiguration('dshWindow');
  const presets = [
    { label: '$(server) 本机 AI 网关（Magpie，端口 3425）', description: '自带/本机已经开着就用这个', url: 'http://127.0.0.1:3425/v1/chat/completions', model: 'auto/deepseek-v4.1-flash', needKey: false },
    { label: '$(plug) WorkBuddy 本地网关（端口 8792）', description: '用 WorkBuddy 的同学：开了本地反代就填这个', url: 'http://127.0.0.1:8792/v1/chat/completions', model: 'group/group', needKey: true },
    { label: '$(cloud) OpenAI（Codex 同款接口，需 API Key）', description: '用 Codex 的同学：填你的 OpenAI Key 即可', url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', needKey: true },
    { label: '$(cloud) DeepSeek（需 API Key）', description: 'api.deepseek.com', url: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', needKey: true },
    { label: '$(chip) 本机 Ollama（免费离线，端口 11434）', description: '要先装 Ollama 并 pull 一个模型', url: 'http://127.0.0.1:11434/v1/chat/completions', model: 'qwen2.5:7b', needKey: false },
    { label: '$(edit) 自定义…', description: '任何 OpenAI 兼容的 /v1/chat/completions 地址', custom: true }
  ];
  const pick = await vscode.window.showQuickPick(presets, { placeHolder: '选一个「讲解」用的 AI 接口（不配也能运行/编译代码）' });
  if (!pick) return;
  let url = pick.url, model = pick.model, needKey = pick.needKey;
  if (pick.custom) {
    url = await vscode.window.showInputBox({ prompt: 'OpenAI 兼容的 /v1/chat/completions 地址', value: cfg.get('gatewayUrl', '') });
    if (!url) return;
    model = await vscode.window.showInputBox({ prompt: '模型 id', value: cfg.get('model', '') });
    if (!model) return;
    needKey = true;
  } else {
    const m = await vscode.window.showInputBox({ prompt: '模型 id（可直接回车用默认）', value: model });
    if (m && m.trim()) model = m.trim();
  }
  let key = cfg.get('apiKey', '');
  if (needKey) {
    const k = await vscode.window.showInputBox({ prompt: 'API Key（没有就留空：讲解会失败，但「运行」照常）', password: true, value: key });
    if (k !== undefined) key = k;
  }
  await cfg.update('gatewayUrl', url, vscode.ConfigurationTarget.Global);
  await cfg.update('model', model, vscode.ConfigurationTarget.Global);
  await cfg.update('apiKey', key || '', vscode.ConfigurationTarget.Global);
  await cfg.update('useGateway', true, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage('已保存 AI 设置：' + model + ' @ ' + url + '。现在保存文件或点「讲这个文件」就会讲。');
}

function activate(context) {
  // 预热 DSH 网页服务（不阻塞）
  ensureUrl().catch(() => {});

  // 配置 AI 讲解接口：给同学用，不用手改 JSON。任何 OpenAI 兼容接口都行。
  context.subscriptions.push(vscode.commands.registerCommand('dshWindow.setupAI', () => setupAI()));

  context.subscriptions.push(vscode.commands.registerCommand('dshWindow.open', async () => {
    try {
      const url = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'DSH 正在启动…', cancellable: false },
        () => ensureUrl()
      );
      // 让问答窗口固定停靠编辑器最右侧：只有一列时先向右开一列，再把简单浏览器移过去
      if (vscode.window.tabGroups.all.length < 2) {
        try { await vscode.commands.executeCommand('workbench.action.newGroupRight'); } catch (e2) {}
      }
      await vscode.commands.executeCommand('simpleBrowser.show', url);
      try { await vscode.commands.executeCommand('workbench.action.moveEditorToLastGroup'); } catch (e2) {}
    } catch (e) {
      vscode.window.showErrorMessage('打开 DSH 失败：' + (e && e.message ? e.message : e));
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('dshWindow.explainFile', () => explain('file')));
  context.subscriptions.push(vscode.commands.registerCommand('dshWindow.explainSelection', () => explain('selection')));
  context.subscriptions.push(vscode.commands.registerCommand('dshWindow.stuck', () => coach('stuck')));
  context.subscriptions.push(vscode.commands.registerCommand('dshWindow.run', () => runCurrent()));
  context.subscriptions.push(vscode.commands.registerCommand('dshWindow.detectLanguage', () => { const ed = vscode.window.activeTextEditor; if (!ed) return; const lang = detectLanguage(ed.document.getText()); if (lang) vscode.languages.setTextDocumentLanguage(ed.document, lang).then(() => vscode.window.showInformationMessage('已识别为：' + lang), () => {}); else vscode.window.showInformationMessage('没认出是什么语言。'); }));

  // 新开（含未保存）文件：能认出语言就自动标上，高亮/运行都跟着对。
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc) => { setTimeout(() => maybeAutoDetect(doc), 50); }));

  // ---- 底部状态栏按钮：全程鼠标点，不用记任何快捷键 ----
  const statusToggle = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const statusRun = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  const statusStuck = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
  const statusExplain = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  const statusAsk = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 97);
  const statusSetup = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 96);
  statusSetup.text = '$(gear) 设置AI';
  statusSetup.tooltip = '不配也能运行/编译代码；点这里选「讲解」用的 AI 接口（本机网关 / WorkBuddy / Codex的OpenAI / DeepSeek / Ollama / 自定义）';
  statusSetup.command = 'dshWindow.setupAI';
  statusSetup.show();
  const refreshStatus = () => {
    const on = vscode.workspace.getConfiguration('dshWindow').get('explainOnSave', true);
    statusToggle.text = on ? '$(book) 自动讲解：开' : '$(book) 自动讲解：关';
    statusToggle.tooltip = on ? '写完保存后，自动在右边从最基础讲解（点一下关闭）' : '自动讲解已关闭（点一下开启）';
    statusToggle.command = 'dshWindow.toggleExplainOnSave';
    statusToggle.backgroundColor = on ? undefined : new vscode.ThemeColor('statusBarItem.warningBackground');
    statusToggle.show();
    statusRun.text = '$(play) 运行';
    statusRun.tooltip = '不用快捷键：自动认出语言、自动挑编译器，在终端里跑当前文件';
    statusRun.command = 'dshWindow.run';
    statusRun.show();
    statusExplain.text = '$(comment-discussion) 讲这个文件';
    statusExplain.tooltip = '不用快捷键：点一下就从最基础讲解当前文件';
    statusExplain.command = 'dshWindow.explainFile';
    statusExplain.show();
    statusStuck.text = '$(debug-alt) 我卡住了';
    statusStuck.tooltip = '不用快捷键：写不出来/报错了，点一下让洄看看卡在哪、下一步写什么';
    statusStuck.command = 'dshWindow.stuck';
    statusStuck.show();
    statusAsk.text = '$(comment) 提问';
    statusAsk.tooltip = '不用快捷键：点一下打开问答窗口，直接问基础问题';
    statusAsk.command = 'dshWindow.open';
    statusAsk.show();
  };
  refreshStatus();
  context.subscriptions.push(statusToggle, statusRun, statusExplain, statusStuck, statusAsk, statusSetup);
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('dshWindow.explainOnSave')) refreshStatus();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('dshWindow.toggleExplainOnSave', async () => {
    const cfg = vscode.workspace.getConfiguration('dshWindow');
    const cur = cfg.get('explainOnSave', true);
    await cfg.update('explainOnSave', !cur, vscode.ConfigurationTarget.Global);
    refreshStatus();
    vscode.window.showInformationMessage('保存时自动讲解：' + (!cur ? '已开启' : '已关闭'));
  }));

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
    const cfg = vscode.workspace.getConfiguration('dshWindow');
    if (!cfg.get('explainOnSave', true)) return;
    if (!isExplainable(doc)) return;
    const active = vscode.window.activeTextEditor;
    if (!active || active.document !== doc) return;
    const text = doc.getText();
    if (text.length > 300000) return;
    const key = doc.uri.toString();
    const h = crypto.createHash('sha1').update(text).digest('hex');
    if (lastHash.get(key) === h) return;
    lastHash.set(key, h);
    if (saveTimers.has(key)) clearTimeout(saveTimers.get(key));
    saveTimers.set(key, setTimeout(() => {
      saveTimers.delete(key);
      const ed = vscode.window.activeTextEditor;
      if (!ed || ed.document.uri.toString() !== key) return;
      coach('coach');
    }, 900));
  }));

  // 边写边讲：代码改动后停手 ~2.5 秒，才让洄看一小段、给「下一步写什么」。
  // 防刷屏/防烧钱：只在停手后触发一次；内容没变不重复；单次最多看 2 万字符。
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => {
    const cfg = vscode.workspace.getConfiguration('dshWindow');
    if (!cfg.get('explainWhileTyping', true)) return;
    // 边写边讲只在走网关（秒级）时开；走 dsh 命令行约 60 秒，跟着打字触发会把上一条不断杀掉，反而永远看不到结果。
    if (!cfg.get('useGateway', true)) return;
    const doc = e.document;
    if (!isExplainable(doc)) return;
    const active = vscode.window.activeTextEditor;
    if (!active || active.document !== doc) return;
    const text = doc.getText();
    if (text.length > 20000) return;
    const key = 'type:' + doc.uri.toString();
    if (typingTimers.has(key)) clearTimeout(typingTimers.get(key));
    typingTimers.set(key, setTimeout(() => {
      typingTimers.delete(key);
      const ed = vscode.window.activeTextEditor;
      if (!ed || ed.document.uri.toString() !== doc.uri.toString()) return;
      const t = ed.document.getText();
      const h = crypto.createHash('sha1').update(t).digest('hex');
      if (lastHash.get('type:' + doc.uri.toString()) === h) return;
      lastHash.set('type:' + doc.uri.toString(), h);
      coach('coach');
    }, 2500));
  }));

  // ---- 「常驻」：重启 VS Code 后右侧「洄·讲解」面板自动恢复；打开工作区时自动常驻显示 ----
  if (vscode.window.registerWebviewPanelSerializer) {
    context.subscriptions.push(vscode.window.registerWebviewPanelSerializer('dshExplain', {
      async deserializeWebviewPanel(p) { panel = p; wirePanel(p); }
    }));
  }
  const autoOpenPanel = () => {
    try {
      const cfg = vscode.workspace.getConfiguration('dshWindow');
      if (!cfg.get('autoOpenPanel', true)) return;
      if (!(vscode.workspace.workspaceFolders || []).length) return;
      ensurePanel();
      if (!curMd) setStatus('点「运行」跑代码；保存文件或点「讲这个文件」，洄就从最基础讲给你听。');
    } catch (e) {}
  };
  autoOpenPanel();
  if (vscode.window.onDidChangeVisibleTextEditors) {
    context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(() => { try { autoOpenPanel(); } catch (e) {} }));
  }
}

function deactivate() {
  killTree(webChild);
  webChild = null;
  killTree(activeProc);
  activeProc = null;
}

module.exports = { activate, deactivate };
