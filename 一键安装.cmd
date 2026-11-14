@echo off
chcp 65001 >nul
echo ==================================================
echo    学习讲解 + 一键运行   安装程序（双击即可）
echo ==================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\install.ps1" -Launch
echo.
echo 安装结束，按任意键关闭...
pause >nul
