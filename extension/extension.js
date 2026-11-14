'use strict';
const vscode = require('vscode');
const { spawn, execSync } = require('child_process');
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
const lastHash = new Map();
const CODE_LANGS = new Set(['python','java','c','cpp','c++','javascript','javascriptreact','typescript','typescriptreact','html','css','scss','less','csharp','go','rust','vue','svelte','json','sql','kotlin','swift','php','ruby']);

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

function ensurePanel() {
  if (panel) { panel.reveal(vscode.ViewColumn.Beside, true); return panel; }
  panel = vscode.window.createWebviewPanel(
    'dshExplain', '洄·讲解',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true }
  );
  panel.webview.html = PANEL_HTML;
  panel.webview.onDidReceiveMessage((msg) => {
    if (msg && msg.type === 'ready' && panel) {
      panel.webview.postMessage({ type: 'status', text: curStatus });
      panel.webview.postMessage({ type: 'update', markdown: curMd });
    }
  });
  panel.onDidDispose(() => { panel = null; });
  return panel;
}

function setStatus(t) { curStatus = t; if (panel) panel.webview.postMessage({ type: 'status', text: t }); }
function setMd(md) { curMd = md; if (panel) panel.webview.postMessage({ type: 'update', markdown: md }); }

function killTree(p) {
  if (!p) return;
  try { spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }); } catch (e) {}
}

function buildPrompt(code, lang, fileName, label) {
  const clipped = code.length > 14000 ? code.slice(0, 14000) + '\n...（已截断，只讲前面部分）' : code;
  return [
    '你是一位耐心的编程入门老师。请从最基础讲清楚下面这段 ' + lang + ' 代码（' + label + '），对象是刚学编程的新手。',
    '用中文、Markdown 输出，严格遵守下面结构：',
    '',
    '## 这段代码想做什么',
    '一句话说清目的。',
    '',
    '## 逐行看懂',
    '用列表，每一行或每一小段讲三件事：①这句在做什么 ②为什么必须这么写 ③不写或写错会怎样。',
    '',
    '## 涉及的基础概念',
    '把用到的概念（变量、循环、条件、函数、数据类型等）从零解释，不要假设我已经懂了。',
    '',
    '## 一个更小的例子',
    '用更简单的代码演示同一个知识点。',
    '',
    '## 怎么自己验证',
    '给出运行 / 打印 / 断点等验证步骤。',
    '',
    '要求：术语第一次出现用一句大白话解释；紧扣这段代码的具体内容，不要泛泛而谈；代码片段用 Markdown 代码块。',
    '',
    '文件名：' + fileName,
    '```' + lang,
    clipped,
    '```'
  ].join('\n');
}

function runExplain(code, lang, fileName, label) {
  const prompt = buildPrompt(code, lang, fileName, label);
  const myRun = ++activeRun;
  if (activeProc) { killTree(activeProc); activeProc = null; }
  ensurePanel();
  setStatus('洄正在从最基础讲解…（约几秒）');
  setMd('*⏳ 正在从最基础开始讲解，请稍等几秒…*');

  // 用「临时 prompt 文件 + launcher.cmd 重定向」把提示喂给 dsh 的 stdin。
  // 不能用 spawn(cmd 字符串, {shell:true}) + p.stdin.write：shell 的 cmd 包裹层吞掉了 stdin，
  // dsh 子进程会一直等 stdin（表现为面板永远停在「正在讲解…」）。
  const stamp = Date.now() + '-' + Math.floor(Math.random() * 1e6);
  const tmpPrompt = path.join(os.tmpdir(), 'dshprompt-' + stamp + '.txt');
  const launcher = path.join(os.tmpdir(), 'dshrun-' + stamp + '.cmd');
  const dsh = resolveDsh();
  if (!dsh) { setStatus('没有找到 dsh，请在设置里填 dshWindow.dshPath'); return; }
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
  let finished = false;

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
      else if (obj.type === 'final') { if (!acc && typeof obj.text === 'string') acc = obj.text; finished = true; flush(true); }
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
      setStatus('讲解完成 · ' + label + ' · 按 Ctrl+Alt+E 再讲一次');
    } else {
      setMd('*讲解没有返回内容（退出码 ' + code + '）。可以再按 Ctrl+Alt+E 重试。*');
      setStatus('未返回内容');
    }
  });
}

function explain(scope) {
  const ed = vscode.window.activeTextEditor;
  if (!ed) { vscode.window.showInformationMessage('请先打开一个代码文件，再让我讲解。'); return; }
  const doc = ed.document;
  let text;
  let label;
  if (scope === 'selection' && ed.selection && !ed.selection.isEmpty) {
    text = doc.getText(ed.selection);
    label = '选中代码';
  } else {
    text = doc.getText();
    label = '当前文件';
  }
  if (!text || !text.trim()) { vscode.window.showInformationMessage('没有可讲解的代码。'); return; }
  const fileName = (doc.fileName || '').split(/[\\/]/).pop() || 'untitled';
  const lang = doc.languageId || 'text';
  runExplain(text, lang, fileName, label);
}

function activate(context) {
  // 预热 DSH 网页服务（不阻塞）
  ensureUrl().catch(() => {});

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

  context.subscriptions.push(vscode.commands.registerCommand('dshWindow.toggleExplainOnSave', async () => {
    const cfg = vscode.workspace.getConfiguration('dshWindow');
    const cur = cfg.get('explainOnSave', true);
    await cfg.update('explainOnSave', !cur, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage('保存时自动讲解：' + (!cur ? '已开启' : '已关闭'));
  }));

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
    const cfg = vscode.workspace.getConfiguration('dshWindow');
    if (!cfg.get('explainOnSave', true)) return;
    if (!CODE_LANGS.has(doc.languageId)) return;
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
      explain('file');
    }, 2500));
  }));
}

function deactivate() {
  killTree(webChild);
  webChild = null;
  killTree(activeProc);
  activeProc = null;
}

module.exports = { activate, deactivate };
