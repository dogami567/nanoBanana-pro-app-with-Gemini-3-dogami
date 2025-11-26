# 🍌 Nano Banana Pro - 4K 多图合成 & 语义理解增强

基于 **nanobanana-pro** 模型的多图合成应用，支持最高 4K 分辨率输出，增强对服饰图案、材质、姿态等视觉语义的理解，适合做花型试样、搭配预览等场景。

## 🌟 核心功能

### 🎨 图像处理模式
- **多图合成**：上传 1–5 张参考图，进行智能融合
- **单图增强**：对单张图片做风格增强 / 局部修改
- **拖拽上传**：直接拖拽到上传区域即可
- **剪贴板支持**：Ctrl+V 粘贴图片

### 🔧 模型与 API 集成
- **nanobanana-pro 模型**：支持最高 4K 分辨率输出
- **更强语义理解**：对「文案 + 多图」的混合输入理解更好
- **多模型选择**：兼容 Gemini 系列模型与 nanobanana-pro
- **进度反馈**：生成过程展示进度与状态
- **异常处理**：API 错误友好提示（配额、鉴权、网络等）

### 💾 历史与引用
- **生成历史侧边栏**：按时间列出所有生成记录
- **本地持久化**：历史记录元数据保存在 localStorage，图片数据存入 IndexedDB，避免爆掉配额
- **图片「引用」功能**：在对话里点「➕ 引用」即可把生成图重新加入上传区，作为下一轮的参考图

### 🚀 交互体验
- **Pop Art / 新野兽派 UI**：高饱和撞色 + 粗黑边框 + 硬阴影
- **响应式布局**：桌面端 / 窄屏都能正常使用
- **实时预览**：上传图片立即显示缩略图

---

## 📦 跨平台下载

> 下述下载链接以当前仓库为准：  
> `https://github.com/dogami567/nanoBanana-pro-app-with-Gemini-3-dogami`

### 🖥️ Windows 用户（推荐）
1. 打开 [Releases 页面](https://github.com/dogami567/nanoBanana-pro-app-with-Gemini-3-dogami/releases)
2. 下载最新版本的 `Nano-Banana-Lite.exe` 或自动安装包（若存在）
3. 双击运行，程序会启动本地服务并自动打开浏览器
4. 在页面里输入 nanobanana-pro / Gemini 的 API Key 即可开始使用

### 🍎 macOS 用户
1. 打开 [Releases 页面](https://github.com/dogami567/nanoBanana-pro-app-with-Gemini-3-dogami/releases)
2. 下载最新的 `Nano-Banana-macOS.dmg`
3. 双击 DMG，拖拽 `Nano-Banana.app` 到「应用程序」
4. 首次运行如被系统拦截，前往「系统设置 → 隐私与安全性」允许运行
5. 打开应用，浏览器会自动打开 UI 页面

### 🐧 Linux / 从源码运行
```bash
# 克隆仓库
git clone https://github.com/dogami567/nanoBanana-pro-app-with-Gemini-3-dogami.git
cd nanoBanana-pro-app-with-Gemini-3-dogami

# 安装 Python 依赖
pip install -r requirements.txt

# 运行应用（Flask + 浏览器）
python app.py
```

---

## 🔑 API Key 获取

1. 访问模型提供方（如 nanobanana-pro / Gemini 对应平台）
2. 创建或复制你的 API Key
3. 在应用顶部「API Key」输入框中填入，并妥善保管

> 提示：API Key 仅保存在本机（浏览器 localStorage 或 exe 本地配置），不会上传到任何第三方服务器。

---

## 🛠️ 技术架构简述

### 前端
- 原生 JavaScript + CSS，避免额外框架依赖
- 多图上传区 + 聊天流式布局
- IndexedDB 存储历史图片，localStorage 存储配置

### 后端（本地）
- Windows / Linux / macOS 源码版：`Flask` + `requests` + `PyInstaller` 打包
- Electron 版：`electron-main.js` + `server.js` + `electron-builder` 打包成 `.exe` / `.dmg`

### 模型调用
- 浏览器 → 本地 `/api/proxy` → 模型提供方 HTTP 接口
- 支持文本 + 图片混合输入，图片以 Base64 / data URL 方式传输

---

## 🌟 与旧版的主要差异

- ✅ 从「Gemini 2.5 Flash Image Preview」升级到 **nanobanana-pro** 主模型
- ✅ 支持最高 **4K 分辨率** 输出
- ✅ 引入多图对话式交互与「图片引用」能力
- ✅ 本地 IndexedDB 持久化历史图片，规避浏览器存储配额错误

---

如果 Nano Banana Pro 对你有帮助，欢迎在 GitHub 上点一颗 ⭐ Star 支持一下！
*** End Patch***} ***!
