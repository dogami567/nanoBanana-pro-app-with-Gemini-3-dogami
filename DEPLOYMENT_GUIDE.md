# Electron App GitHub Actions 自动构建部署指南

## 📋 完整操作流程

本文档记录了如何为 Electron 应用配置 GitHub Actions 自动构建 Mac 和 Windows 版本。

---

## 🎯 目标

- 配置 GitHub Actions 自动构建 Mac (DMG) 和 Windows (EXE) 安装包
- 推送 Git tag 时自动触发构建
- 构建产物自动上传到 GitHub Release

---

## 📁 项目结构

```
nano-banana-app/
├── .github/
│   └── workflows/
│       ├── build-mac.yml       # macOS 构建配置
│       └── build-windows.yml   # Windows 构建配置
├── package.json                # Electron 项目配置
├── electron-main.js            # Electron 主进程
├── index.html                  # 应用界面
└── ...
```

---

## 🔧 步骤 1: 配置 package.json

### 添加 Mac 和 Windows 构建配置

```json
{
  "name": "nano-banana-app",
  "version": "0.0.3",
  "main": "electron-main.js",
  "scripts": {
    "start": "node server.js",
    "electron": "electron .",
    "build": "electron-builder",
    "build-win": "electron-builder --win",
    "build-mac": "electron-builder --mac"
  },
  "dependencies": {
    "express": "^4.18.2",
    "electron": "^22.0.0"
  },
  "devDependencies": {
    "electron-builder": "^24.0.0"
  },
  "build": {
    "appId": "com.claude.nano-banana",
    "productName": "Nano Banana",
    "directories": {
      "output": "dist"
    },
    "files": [
      "electron-main.js",
      "index.html",
      "styles.css",
      "script.js",
      "api.js",
      "utils.js",
      "node_modules/**/*"
    ],
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ],
      "icon": "icon.ico"
    },
    "mac": {
      "target": [
        {
          "target": "dmg",
          "arch": ["x64", "arm64"]
        }
      ],
      "category": "public.app-category.graphics-design",
      "icon": "icon.icns"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    }
  }
}
```

### 关键配置说明

- **build-win**: Windows NSIS 安装程序，x64 架构
- **build-mac**: macOS DMG 文件，支持 Intel (x64) 和 Apple Silicon (arm64)
- **files**: 打包时包含的文件列表
- **icon**: Windows 使用 .ico，Mac 使用 .icns

---

## 🚀 步骤 2: 创建 GitHub Actions Workflows

### 文件 1: `.github/workflows/build-mac.yml`

```yaml
name: Build macOS App

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build-mac:
    runs-on: macos-13

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Build Mac app
        run: npm run build-mac
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: List dist directory
        run: ls -lah dist/

      - name: Upload DMG to Release
        uses: softprops/action-gh-release@v1
        if: startsWith(github.ref, 'refs/tags/')
        with:
          files: dist/*.dmg
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: mac-dmg
          path: dist/*.dmg
```

### 文件 2: `.github/workflows/build-windows.yml`

```yaml
name: Build Windows App

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build-windows:
    runs-on: windows-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Build Windows app
        run: npm run build-win
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: List dist directory
        run: dir dist

      - name: Upload installer to Release
        uses: softprops/action-gh-release@v1
        if: startsWith(github.ref, 'refs/tags/')
        with:
          files: dist/*.exe
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: windows-installer
          path: dist/*.exe
```

### Workflow 配置说明

**触发条件**:
- `push.tags: v*` - 推送 v 开头的标签时自动触发
- `workflow_dispatch` - 支持手动触发

**关键配置**:
- `runs-on: macos-13` - 使用 macOS 13 runner（稳定版本）
- `runs-on: windows-latest` - 使用最新的 Windows runner
- `node-version: '20'` - 使用 Node.js 20 LTS
- `npm install` - 安装依赖（比 npm ci 更宽容）

**重要经验**:
- ⚠️ 不要使用 `npm ci`，会因为 lock file 版本冲突失败
- ⚠️ macOS 不要用 macos-latest，明确指定 macos-13
- ✅ 使用最新的 actions 版本 (v4)
- ✅ 使用 Node.js 20 而不是 18

---

## 📦 步骤 3: 发布新版本

### 3.1 提交代码

```bash
# 进入项目目录
cd D:\nanobababa-advanced\nano-banana-app-Gemini-2.5-Flash-lmage-Preview

# 添加 workflow 文件
git add .github/workflows/
git commit -m "feat: 添加 GitHub Actions 自动构建 workflow"
git push origin master
```

### 3.2 更新版本号

```bash
# 编辑 package.json 中的版本号
# "version": "0.0.3"

# 提交版本更新
git add package.json
git commit -m "chore: 更新版本号到 0.0.3"
git push origin master
```

### 3.3 创建并推送 Tag

```bash
# 创建标签
git tag -a v0.0.3 -m "Release v0.0.3: Mac 和 Windows 自动构建"

# 推送标签（这会触发 GitHub Actions）
git push origin v0.0.3
```

### 3.4 查看构建进度

访问 GitHub Actions 页面：
```
https://github.com/YOUR_USERNAME/YOUR_REPO/actions
```

构建时间：
- macOS: 约 8-12 分钟
- Windows: 约 5-8 分钟

---

## 🔄 步骤 4: 如果需要重新构建

### 删除并重新创建标签

```bash
# 删除本地标签
git tag -d v0.0.3

# 删除远程标签
git push origin :refs/tags/v0.0.3

# 重新创建标签
git tag -a v0.0.3 -m "Release v0.0.3: Mac 和 Windows 自动构建"

# 推送标签
git push origin v0.0.3
```

---

## 🎉 步骤 5: 检查构建产物

### 5.1 在 Actions 页面查看

- 构建成功后会显示绿色 ✅
- 可以下载 Artifacts：
  - `mac-dmg`: macOS 安装包
  - `windows-installer`: Windows 安装程序

### 5.2 在 Release 页面查看

访问：
```
https://github.com/YOUR_USERNAME/YOUR_REPO/releases
```

会自动创建 Release 并包含：
- `Nano Banana-0.0.3.dmg` (Mac 版本)
- `Nano Banana Setup 0.0.3.exe` (Windows 版本)

---

## ⚠️ 常见问题和解决方案

### 问题 1: "Too many retries" 错误

**原因**: `npm ci` 对 package-lock.json 版本要求严格

**解决方案**: 使用 `npm install` 而不是 `npm ci`

```yaml
- name: Install dependencies
  run: npm install  # ✅ 正确
  # run: npm ci     # ❌ 容易出错
```

---

### 问题 2: macOS Runner 弃用警告

**原因**: macos-latest 已切换到更新的版本

**解决方案**: 明确指定 macos-13

```yaml
jobs:
  build-mac:
    runs-on: macos-13  # ✅ 明确指定
    # runs-on: macos-latest  # ❌ 可能有兼容性问题
```

---

### 问题 3: 构建没有触发

**原因**:
1. Workflow 文件在 tag 对应的提交中不存在
2. Tag 推送时机不对

**解决方案**:
1. 先推送 workflow 文件到 master
2. 确保 workflow 文件已在远程仓库
3. 然后再创建并推送 tag

```bash
# 正确顺序
git push origin master          # 1. 先推送代码
git tag -a v0.0.3 -m "Release"  # 2. 创建标签
git push origin v0.0.3          # 3. 推送标签（触发构建）
```

---

### 问题 4: Actions 版本过旧

**症状**: 出现各种兼容性警告

**解决方案**: 使用最新版本的 actions

```yaml
- uses: actions/checkout@v4        # ✅ v4
- uses: actions/setup-node@v4      # ✅ v4
- uses: actions/upload-artifact@v3 # ✅ v3

# 不要使用
# - uses: actions/checkout@v3      # ❌ 过旧
```

---

## 📊 完整的 Git 操作时间线

```bash
# 1. 初始化和推送源码
cd D:\nanobababa-advanced\nano-banana-app-Gemini-2.5-Flash-lmage-Preview
git status
git push origin master

# 2. 配置 package.json（添加 Mac 构建配置）
# 编辑 package.json
git add package.json
git commit -m "feat: 升级版本到 v1.1.0 并添加 Mac 构建支持"

# 3. 添加 GitHub Actions workflows
mkdir -p .github/workflows
# 创建 build-mac.yml 和 build-windows.yml
git add .github/workflows/
git commit -m "feat: 添加 GitHub Actions 自动构建 workflow"
git push origin master

# 4. 修复 workflow 配置
# 修改 workflows 文件（npm ci -> npm install, 等）
git add .github/workflows/
git commit -m "fix: 修复 GitHub Actions 构建失败问题"
git push origin master

# 5. 更新版本号
# 编辑 package.json version: "0.0.3"
git add package.json
git commit -m "chore: 更新版本号到 0.0.3"
git push origin master

# 6. 创建并推送标签（触发构建）
git tag -a v0.0.3 -m "Release v0.0.3: Mac 和 Windows 自动构建"
git push origin v0.0.3

# 7. 如果需要重新构建
git tag -d v0.0.3
git push origin :refs/tags/v0.0.3
git tag -a v0.0.3 -m "Release v0.0.3"
git push origin v0.0.3
```

---

## 🎯 关键要点总结

### ✅ 正确的做法

1. **依赖安装**: 使用 `npm install` 而不是 `npm ci`
2. **Node.js 版本**: 使用 Node.js 20 LTS
3. **macOS Runner**: 明确使用 `macos-13`
4. **Actions 版本**: 使用最新的 v4 版本
5. **推送顺序**: 先推送代码，再推送 tag

### ❌ 需要避免的做法

1. 不要使用 `npm ci`（容易因 lock file 失败）
2. 不要使用 `macos-latest`（可能有兼容性问题）
3. 不要使用 Node.js 18（建议用 20）
4. 不要在代码推送前推送 tag
5. 不要使用过旧的 actions 版本

---

## 📝 完整的配置文件清单

### 必需文件：

1. ✅ `package.json` - Electron 和构建配置
2. ✅ `.github/workflows/build-mac.yml` - macOS 构建
3. ✅ `.github/workflows/build-windows.yml` - Windows 构建
4. ✅ `icon.ico` - Windows 图标
5. ✅ `icon.icns` - macOS 图标（如果需要）

### 可选文件：

- `package-lock.json` - NPM 依赖锁定文件
- `README.md` - 项目说明
- `LICENSE` - 开源协议

---

## 🔗 有用的链接

- **GitHub Actions 文档**: https://docs.github.com/en/actions
- **electron-builder 文档**: https://www.electron.build/
- **Actions Marketplace**: https://github.com/marketplace?type=actions

---

## 💡 最佳实践

1. **版本命名**: 使用语义化版本 (v0.0.3, v1.0.0)
2. **提交信息**: 使用 conventional commits (feat, fix, chore)
3. **测试构建**: 首次配置时先用 workflow_dispatch 手动测试
4. **监控构建**: 在 Actions 页面实时查看构建日志
5. **Release Notes**: 为每个 Release 添加详细的更新说明

---

**文档生成时间**: 2025-11-26
**适用版本**: Electron 22+, Node.js 20+, GitHub Actions 2024+
