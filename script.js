/**
 * 主应用程序脚本
 * 多图上传 + 对话流 + 历史记录 + 引用图片
 */

// 全局应用状态
const AppState = {
    baseUrl: 'https://api.linkapi.org',
    apiKey: '',
    selectedModel: 'nano-banana-2-4k',
    isGenerating: false,
    isSidebarOpen: false,
    generationHistory: [],      // 仅存文本和 imageId
    conversationHistory: [],    // 发给 API 的上下文
    currentImages: [],          // 当前待发送图片 { id, base64, mimeType, file }
    activeHistoryId: null
};

// DOM 引用
const DOMElements = {
    baseUrlInput: null,
    multiImageInput: null,
    imagePreviewGrid: null,
    imageCount: null,
    clearAllImagesBtn: null,
    apiKeyInput: null,
    modelInput: null,
    modelList: null,
    promptInput: null,
    generateBtn: null,
    progressSection: null,
    progressFill: null,
    progressText: null,
    resultSection: null,
    chatStream: null,
    historySidebar: null,
    historyList: null,
    historyCount: null,
    clearHistoryBtn: null
};

/**
 * 初始化应用
 */
function initializeApp() {
    // 绑定 DOM
    DOMElements.baseUrlInput = document.getElementById('apiBaseUrl');
    DOMElements.multiImageInput = document.getElementById('multiImageInput');
    DOMElements.imagePreviewGrid = document.getElementById('imagePreviewGrid');
    DOMElements.imageCount = document.getElementById('imageCount');
    DOMElements.clearAllImagesBtn = document.getElementById('clearAllImagesBtn');

    DOMElements.apiKeyInput = document.getElementById('apiKey');
    DOMElements.modelInput = document.getElementById('modelInput');
    DOMElements.modelList = document.getElementById('modelList');
    DOMElements.promptInput = document.getElementById('promptInput');
    DOMElements.generateBtn = document.getElementById('generateBtn');

    DOMElements.progressSection = document.getElementById('progressSection');
    DOMElements.progressFill = document.getElementById('progressFill');
    DOMElements.progressText = document.getElementById('progressText');

    DOMElements.resultSection = document.getElementById('resultSection');
    DOMElements.chatStream = document.getElementById('chatStream');

    DOMElements.historySidebar = document.getElementById('historySidebar');
    DOMElements.historyList = document.getElementById('historyList');
    DOMElements.historyCount = document.getElementById('historyCount');
    DOMElements.clearHistoryBtn = document.getElementById('clearHistoryBtn');

    bindEventListeners();
    restoreConfigFromStorage();
    updateGenerateButtonState();
    loadHistoryFromStorage();
    updateHistoryDisplay();

    showNotification('应用初始化完成', 'success');
}

/**
 * 事件绑定
 */
function bindEventListeners() {
    if (DOMElements.baseUrlInput) {
        DOMElements.baseUrlInput.addEventListener('input', debounce(handleBaseUrlChange, 300));
    }

    if (DOMElements.apiKeyInput) {
        DOMElements.apiKeyInput.addEventListener('input', debounce(handleApiKeyChange, 300));
    }

    if (DOMElements.modelInput) {
        DOMElements.modelInput.addEventListener('input', handleModelChange);
        DOMElements.modelInput.addEventListener('change', handleModelChange);
    }

    if (DOMElements.promptInput) {
        DOMElements.promptInput.addEventListener('input', debounce(updateGenerateButtonState, 300));
    }

    if (DOMElements.multiImageInput) {
        DOMElements.multiImageInput.addEventListener('change', handleMultiImageUpload);
    }

    // 阻止全局拖拽默认行为
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    // 粘贴图片
    document.addEventListener('paste', handlePasteEvent);

    // Enter 发送
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

function handleBaseUrlChange() {
    let url = DOMElements.baseUrlInput.value.trim();
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    AppState.baseUrl = url;
    if (url) {
        localStorage.setItem('gemini-api-base-url', url);
    }
}

function handleApiKeyChange() {
    AppState.apiKey = DOMElements.apiKeyInput.value.trim();
    if (AppState.apiKey) {
        localStorage.setItem('gemini-api-key', AppState.apiKey);
    }
    updateGenerateButtonState();
}

function handleModelChange() {
    AppState.selectedModel = DOMElements.modelInput.value.trim();
    updateGenerateButtonState();
}

function restoreConfigFromStorage() {
    const savedBaseUrl = localStorage.getItem('gemini-api-base-url');
    if (savedBaseUrl && DOMElements.baseUrlInput) {
        DOMElements.baseUrlInput.value = savedBaseUrl;
        AppState.baseUrl = savedBaseUrl;
    } else if (DOMElements.baseUrlInput) {
        DOMElements.baseUrlInput.value = AppState.baseUrl;
    }

    const savedApiKey = localStorage.getItem('gemini-api-key');
    if (savedApiKey && DOMElements.apiKeyInput) {
        DOMElements.apiKeyInput.value = savedApiKey;
        AppState.apiKey = savedApiKey;
    }
}

/**
 * 刷新模型列表
 */
async function refreshModels() {
    if (!AppState.apiKey) {
        showNotification('请先输入 API 密钥', 'error');
        return;
    }

    const refreshBtn = document.getElementById('refreshModelsBtn');
    if (!refreshBtn) return;

    const originalText = refreshBtn.textContent;
    try {
        refreshBtn.textContent = '🔄';
        refreshBtn.disabled = true;

        const models = await getAvailableModels(AppState.apiKey, AppState.baseUrl);

        if (DOMElements.modelList) {
            DOMElements.modelList.innerHTML = '';
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                DOMElements.modelList.appendChild(option);
            });
        }

        if (models.length > 0) {
            if (!DOMElements.modelInput.value) {
                DOMElements.modelInput.value = models[0];
                AppState.selectedModel = models[0];
            }
        }

        showNotification(`成功获取 ${models.length} 个可用模型`, 'success');
    } catch (error) {
        console.error('刷新模型失败:', error);
        showNotification(`获取模型失败: ${error.message}`, 'error');
    } finally {
        refreshBtn.textContent = originalText;
        refreshBtn.disabled = false;
    }
}

/**
 * 多图上传
 */
async function handleMultiImageUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    let addedCount = 0;

    for (const file of files) {
        if (AppState.currentImages.length >= 5) {
            showNotification('最多只能上传 5 张图片', 'warning');
            break;
        }

        if (!validateImageFile(file)) continue;

        try {
            const base64Data = await fileToBase64(file);
            const imageObj = {
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                file,
                base64: base64Data,
                mimeType: getFileMimeType(file)
            };

            AppState.currentImages.push(imageObj);
            renderImagePreview(imageObj);
            addedCount++;
        } catch (error) {
            console.error('图片处理失败:', error);
            showNotification(`图片 ${file.name} 处理失败`, 'error');
        }
    }

    if (addedCount > 0) {
        updateImageCount();
        updateGenerateButtonState();
        showNotification(`成功添加 ${addedCount} 张图片`, 'success');
    }

    DOMElements.multiImageInput.value = '';
}

/**
 * 渲染单张图片预览
 */
function renderImagePreview(imageObj) {
    const div = document.createElement('div');
    div.className = 'preview-item';
    div.id = `preview-${imageObj.id}`;

    div.innerHTML = `
        <img src="data:${imageObj.mimeType};base64,${imageObj.base64}" alt="preview">
        <button class="remove-img-btn" onclick="removeImage('${imageObj.id}')">🗑️</button>
    `;

    DOMElements.imagePreviewGrid.appendChild(div);
    if (DOMElements.clearAllImagesBtn) {
        DOMElements.clearAllImagesBtn.style.display = 'block';
    }
}

function removeImage(id) {
    AppState.currentImages = AppState.currentImages.filter(img => img.id !== id);
    const el = document.getElementById(`preview-${id}`);
    if (el) el.remove();

    updateImageCount();
    updateGenerateButtonState();

    if (AppState.currentImages.length === 0 && DOMElements.clearAllImagesBtn) {
        DOMElements.clearAllImagesBtn.style.display = 'none';
    }
}

function clearAllImages() {
    AppState.currentImages = [];
    DOMElements.imagePreviewGrid.innerHTML = '';
    if (DOMElements.clearAllImagesBtn) {
        DOMElements.clearAllImagesBtn.style.display = 'none';
    }
    updateImageCount();
    updateGenerateButtonState();
    showNotification('所有图片已清空', 'info');
}

function updateImageCount() {
    if (DOMElements.imageCount) {
        DOMElements.imageCount.textContent = AppState.currentImages.length.toString();
    }
}

function updateGenerateButtonState() {
    if (!DOMElements.generateBtn) return;

    const hasApiKey = !!AppState.apiKey;
    const hasPrompt = DOMElements.promptInput && DOMElements.promptInput.value.trim().length > 0;
    const isNotGenerating = !AppState.isGenerating;

    const canGenerate = hasApiKey && hasPrompt && isNotGenerating;
    DOMElements.generateBtn.disabled = !canGenerate;

    const imageCount = AppState.currentImages.length;

    if (!hasApiKey) {
        DOMElements.generateBtn.textContent = '🔑 请输入 API 密钥';
    } else if (!hasPrompt) {
        DOMElements.generateBtn.textContent = '✍️ 请输入提示词';
    } else if (AppState.isGenerating) {
        DOMElements.generateBtn.textContent = '⏳ 正在生成...';
    } else {
        DOMElements.generateBtn.textContent = `🚀 发送消息 (${imageCount} 图)`;
    }
}

/**
 * 生成图像 / 对话主流程
 */
async function generateImage() {
    if (AppState.isGenerating) return;

    const prompt = DOMElements.promptInput.value.trim();
    if (!prompt) return;

    try {
        AppState.isGenerating = true;
        updateGenerateButtonState();

        DOMElements.resultSection.style.display = 'block';

        const newParts = [{ text: prompt }];
        AppState.currentImages.forEach(img => {
            newParts.push({
                inlineData: {
                    mimeType: img.mimeType,
                    data: img.base64
                }
            });
        });

        // 先渲染用户消息
        renderMessage('user', { text: prompt, images: AppState.currentImages });
        DOMElements.chatStream.scrollTop = DOMElements.chatStream.scrollHeight;

        DOMElements.progressSection.style.display = 'block';
        updateProgress(5, '准备发送请求...');

        const result = await generateImageWithGemini({
            baseUrl: AppState.baseUrl,
            apiKey: AppState.apiKey,
            model: AppState.selectedModel,
            history: AppState.conversationHistory,
            newParts,
            onProgress: updateProgress
        });

        AppState.conversationHistory.push({ role: 'user', parts: newParts });
        AppState.conversationHistory.push({
            role: 'model',
            parts: [{ text: result.text || '[Image Generated]' }]
        });

        renderMessage('model', result);

        await saveToHistory({
            prompt,
            result,
            imageCount: AppState.currentImages.length,
            model: AppState.selectedModel
        });

        DOMElements.promptInput.value = '';
        clearAllImages();
    } catch (error) {
        console.error('生成失败:', error);
        showNotification(`生成失败: ${error.message}`, 'error');
        renderMessage('model', { text: `❌ 错误: ${error.message}` });
    } finally {
        AppState.isGenerating = false;
        DOMElements.progressSection.style.display = 'none';
        updateGenerateButtonState();
        setTimeout(() => {
            DOMElements.chatStream.scrollTop = DOMElements.chatStream.scrollHeight;
        }, 100);
    }
}

/**
 * 渲染聊天消息
 */
function renderMessage(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;

    let html = '';

    if (content.text) {
        const formattedText = content.text.replace(/\n/g, '<br>');
        html += `<div class="message-text">${formattedText}</div>`;
    }

    if (content.images && content.images.length > 0) {
        html += `<div class="message-images">`;
        content.images.forEach(img => {
            const b64 = img.base64 || img.data;
            const mime = img.mimeType || 'image/jpeg';
            if (role === 'model') {
                html += `
                <div class="message-image-wrapper">
                    <img src="data:${mime};base64,${b64}" alt="message image">
                    <button class="reuse-img-btn" onclick="reuseImage('${b64}', '${mime}')">➕ 引用</button>
                </div>`;
            } else {
                html += `
                <div class="message-image-wrapper">
                    <img src="data:${mime};base64,${b64}" alt="message image">
                </div>`;
            }
        });
        html += `</div>`;
    }

    div.innerHTML = html;
    DOMElements.chatStream.appendChild(div);
}

function updateProgress(percentage, message) {
    if (DOMElements.progressFill) {
        DOMElements.progressFill.style.width = `${percentage}%`;
    }
    if (DOMElements.progressText) {
        DOMElements.progressText.textContent = message;
    }
}

/**
 * 粘贴图片
 */
async function handlePasteEvent(event) {
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        const items = event.clipboardData?.items;
        let hasImage = false;
        for (let i = 0; i < (items ? items.length : 0); i++) {
            if (items[i].type.startsWith('image/')) hasImage = true;
        }
        if (!hasImage) return;
    }

    const items = event.clipboardData?.items;
    if (!items) return;

    const imageFiles = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) imageFiles.push(file);
        }
    }

    if (imageFiles.length > 0) {
        event.preventDefault();
        await handleMultiImageUpload({ target: { files: imageFiles } });
    }
}

function handleKeyboardShortcuts(event) {
    if (event.key === 'Enter' && !event.ctrlKey && !event.shiftKey) {
        if (document.activeElement === DOMElements.promptInput) {
            event.preventDefault();
            if (!DOMElements.generateBtn.disabled) {
                generateImage();
            }
        }
    }
}

/**
 * 历史记录管理（文本 + imageId，图片存 IndexedDB）
 */
async function saveToHistory(record) {
    const historyId = Date.now().toString(36);
    let imageId = null;

    const firstImage = record.result.images && record.result.images.length > 0
        ? record.result.images[0]
        : null;

    if (firstImage && typeof ImageDB !== 'undefined') {
        imageId = `img_${historyId}_${Math.random().toString(36).substr(2, 6)}`;
        const base64Data = firstImage.base64 || firstImage.data;
        try {
            await ImageDB.save(imageId, base64Data);
        } catch (e) {
            console.error('保存历史图片到 IndexedDB 失败:', e);
            imageId = null;
        }
    }

    const historyItem = {
        id: historyId,
        timestamp: new Date().toISOString(),
        prompt: record.prompt,
        resultText: record.result.text,
        imageId,
        mode: `${record.imageCount} 图模式`
    };

    AppState.generationHistory.unshift(historyItem);
    if (AppState.generationHistory.length > 20) {
        AppState.generationHistory = AppState.generationHistory.slice(0, 20);
    }

    saveHistoryToStorage();
    updateHistoryDisplay();
}

function loadHistoryFromStorage() {
    try {
        const savedHistory = localStorage.getItem('nano-banana-history');
        if (savedHistory) {
            AppState.generationHistory = JSON.parse(savedHistory);
        }
    } catch (error) {
        console.error('加载历史记录失败:', error);
        AppState.generationHistory = [];
    }
}

function saveHistoryToStorage() {
    try {
        localStorage.setItem('nano-banana-history', JSON.stringify(AppState.generationHistory));
    } catch (error) {
        console.error('保存历史记录失败:', error);
        if (error.name === 'QuotaExceededError') {
            AppState.generationHistory = [];
            localStorage.removeItem('nano-banana-history');
        }
    }
}

function updateHistoryDisplay() {
    const historyList = DOMElements.historyList;
    const historyCount = DOMElements.historyCount;
    const clearBtn = DOMElements.clearHistoryBtn;

    historyCount.textContent = `${AppState.generationHistory.length} 条记录`;
    clearBtn.disabled = AppState.generationHistory.length === 0;
    historyList.innerHTML = '';

    if (AppState.generationHistory.length === 0) {
        historyList.innerHTML = `<div class="empty-history"><p>🎨 暂无记录</p></div>`;
        return;
    }

    AppState.generationHistory.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <div class="history-info">
                <div class="history-prompt">${item.prompt.substring(0, 50)}...</div>
                <div class="history-meta">${new Date(item.timestamp).toLocaleTimeString()}</div>
            </div>
        `;
        historyList.appendChild(div);
    });
}

async function clearAllHistory() {
    if (!confirm('确定清空历史记录吗？')) return;
    AppState.generationHistory = [];
    if (typeof ImageDB !== 'undefined') {
        try {
            await ImageDB.clear();
        } catch (e) {
            console.error('清空 IndexedDB 图片失败:', e);
        }
    }
    saveHistoryToStorage();
    updateHistoryDisplay();
}

function toggleSidebar() {
    AppState.isSidebarOpen = !AppState.isSidebarOpen;
    const sidebar = DOMElements.historySidebar;
    const mainContainer = document.querySelector('.main-container');

    if (AppState.isSidebarOpen) {
        sidebar.classList.add('open');
        if (window.innerWidth > 768) mainContainer.classList.add('sidebar-open');
    } else {
        sidebar.classList.remove('open');
        mainContainer.classList.remove('sidebar-open');
    }
}

/**
 * 将模型生成的图片加入当前参考图列表
 */
function reuseImage(base64, mimeType) {
    const imageObj = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        file: null,
        base64,
        mimeType: mimeType || 'image/png'
    };

    AppState.currentImages.push(imageObj);
    renderImagePreview(imageObj);
    updateImageCount();
    updateGenerateButtonState();
    if (DOMElements.clearAllImagesBtn) {
        DOMElements.clearAllImagesBtn.style.display = 'block';
    }
    showNotification('已将图片添加到参考列表', 'success');
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initializeApp);

