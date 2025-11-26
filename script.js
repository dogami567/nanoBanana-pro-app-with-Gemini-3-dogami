/**
 * 主应用程序脚本
 * 遵循SOLID原则和完整实现原则
 */

// 应用状态管理
const AppState = {
    baseUrl: 'https://api.linkapi.org',
    apiKey: '',
    selectedModel: 'nano-banana-2-4k',
    isGenerating: false,
    isSidebarOpen: false,
    generationHistory: [],
    conversationHistory: [],
    currentImages: [],
    activeHistoryId: null
};

// DOM元素引用
const DOMElements = {
    baseUrlInput: null,
    // ... (rest of the elements)
    multiImageInput: null,
    imagePreviewGrid: null,
    imageCount: null,
    clearAllImagesBtn: null,
    apiKeyInput: null,
    modelSelect: null,
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
 * 初始化应用程序
 */
function initializeApp() {
    // 获取DOM元素引用
    DOMElements.baseUrlInput = document.getElementById('apiBaseUrl');
    DOMElements.multiImageInput = document.getElementById('multiImageInput');
    DOMElements.imagePreviewGrid = document.getElementById('imagePreviewGrid');
    DOMElements.imageCount = document.getElementById('imageCount');
    DOMElements.clearAllImagesBtn = document.getElementById('clearAllImagesBtn');
    
    DOMElements.apiKeyInput = document.getElementById('apiKey');
    DOMElements.modelSelect = document.getElementById('modelSelect');
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
    
    // 绑定事件监听器
    bindEventListeners();
    
    // 从localStorage恢复配置
    restoreConfigFromStorage();
    
    // 检查生成按钮状态
    updateGenerateButtonState();
    
    loadHistoryFromStorage();
    updateHistoryDisplay();
    
    showNotification('应用初始化完成', 'success');
}

/**
 * 绑定所有事件监听器
 */
function bindEventListeners() {
    // Base URL 输入事件
    DOMElements.baseUrlInput.addEventListener('input', debounce(handleBaseUrlChange, 300));

    // API密钥输入事件
    DOMElements.apiKeyInput.addEventListener('input', debounce(handleApiKeyChange, 300));
    
    // ... (rest of bindings)
    DOMElements.modelSelect.addEventListener('change', handleModelChange);
    DOMElements.promptInput.addEventListener('input', debounce(updateGenerateButtonState, 300));
    DOMElements.multiImageInput.addEventListener('change', handleMultiImageUpload);

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    document.addEventListener('paste', handlePasteEvent);
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

/**
 * 处理 Base URL 变化
 */
function handleBaseUrlChange() {
    let url = DOMElements.baseUrlInput.value.trim();
    // 移除末尾斜杠
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    AppState.baseUrl = url;
    if (url) {
        localStorage.setItem('gemini-api-base-url', url);
    }
}

/**
 * 处理API密钥变化
 */
function handleApiKeyChange() {
    AppState.apiKey = DOMElements.apiKeyInput.value.trim();
    if (AppState.apiKey) {
        localStorage.setItem('gemini-api-key', AppState.apiKey);
    }
    updateGenerateButtonState();
}

/**
 * 从localStorage恢复配置 (Base URL & API Key)
 */
function restoreConfigFromStorage() {
    const savedBaseUrl = localStorage.getItem('gemini-api-base-url');
    if (savedBaseUrl) {
        DOMElements.baseUrlInput.value = savedBaseUrl;
        AppState.baseUrl = savedBaseUrl;
    } else {
        // 默认值
        DOMElements.baseUrlInput.value = AppState.baseUrl;
    }

    const savedApiKey = localStorage.getItem('gemini-api-key');
    if (savedApiKey) {
        DOMElements.apiKeyInput.value = savedApiKey;
        AppState.apiKey = savedApiKey;
    }
}

/**
 * 刷新可用模型列表
 */
async function refreshModels() {
    if (!AppState.apiKey) {
        showNotification('请先输入API密钥', 'error');
        return;
    }
    
    const refreshBtn = document.getElementById('refreshModelsBtn');
    const originalText = refreshBtn.textContent;
    
    try {
        refreshBtn.textContent = '🔄 获取中...';
        refreshBtn.disabled = true;
        
        // 传入 baseUrl
        const models = await getAvailableModels(AppState.apiKey, AppState.baseUrl);
        
        DOMElements.modelSelect.innerHTML = '';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            DOMElements.modelSelect.appendChild(option);
        });
        
        if (models.includes(AppState.selectedModel)) {
            DOMElements.modelSelect.value = AppState.selectedModel;
        } else {
            AppState.selectedModel = models[0];
            DOMElements.modelSelect.value = models[0];
        }
        
        showNotification(`成功获取${models.length}个可用模型`, 'success');
        
    } catch (error) {
        console.error('刷新模型失败:', error);
        showNotification(`获取模型失败: ${error.message}`, 'error');
    } finally {
        refreshBtn.textContent = originalText;
        refreshBtn.disabled = false;
    }
}

/**
 * 生成图像主函数
 */
async function generateImage() {
    if (AppState.isGenerating) return;
    
    try {
        AppState.isGenerating = true;
        updateGenerateButtonState();
        
        DOMElements.resultSection.style.display = 'block';
        const prompt = DOMElements.promptInput.value.trim();
        
        const newParts = [{ text: prompt }];
        AppState.currentImages.forEach(img => {
            newParts.push({
                inlineData: {
                    mimeType: img.mimeType,
                    data: img.base64
                }
            });
        });
        
        renderMessage('user', { text: prompt, images: AppState.currentImages });
        DOMElements.chatStream.scrollTop = DOMElements.chatStream.scrollHeight;
        DOMElements.progressSection.style.display = 'block';
        
        // 调用API，传入 baseUrl
        const result = await generateImageWithGemini({
            baseUrl: AppState.baseUrl, // Pass base URL
            apiKey: AppState.apiKey,
            model: AppState.selectedModel,
            history: AppState.conversationHistory,
            newParts: newParts,
            onProgress: updateProgress
        });
        
        AppState.conversationHistory.push({ role: 'user', parts: newParts });
        
        if (result.text) {
             AppState.conversationHistory.push({ role: 'model', parts: [{ text: result.text }] });
        } else {
             AppState.conversationHistory.push({ role: 'model', parts: [{ text: "[Image Generated]" }] });
        }

        renderMessage('model', result);
        
        saveToHistory({
            prompt: prompt,
            result: result,
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
 * @param {string} role - 'user' | 'model'
 * @param {Object} content - { text, images: [] }
 */
function renderMessage(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    
    let html = '';
    
    // 渲染文本
    if (content.text) {
        // 简单处理换行
        const formattedText = content.text.replace(/\n/g, '<br>');
        html += `<div class="message-text">${formattedText}</div>`;
    }
    
    // 渲染图片
    if (content.images && content.images.length > 0) {
        html += `<div class="message-images">`;
        content.images.forEach(img => {
            // img 可能是 { base64, mimeType } 或 { data, mimeType } (API返回)
            const b64 = img.base64 || img.data;
            const mime = img.mimeType || 'image/jpeg'; // 默认
            html += `<img src="data:${mime};base64,${b64}" alt="message image">`;
            
            // 如果是 AI 生成的图，加个保存按钮？
            if (role === 'model') {
                // 简化版，暂不加复杂按钮，点击图片可以预览或保存
            }
        });
        html += `</div>`;
    }
    
    div.innerHTML = html;
    DOMElements.chatStream.appendChild(div);
}


/**
 * 更新进度显示
 */
function updateProgress(percentage, message) {
    DOMElements.progressFill.style.width = `${percentage}%`;
    DOMElements.progressText.textContent = message;
}

/**
 * 处理键盘粘贴事件
 */
async function handlePasteEvent(event) {
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        // 如果在输入框，且粘贴的是文本，让默认行为发生
        // 如果粘贴的是图片，我们拦截
        const items = event.clipboardData?.items;
        let hasImage = false;
        for (let i = 0; i < items.length; i++) {
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
        await processFiles(imageFiles);
    }
}

/**
 * 处理键盘快捷键
 */
function handleKeyboardShortcuts(event) {
    // Enter 发送 (Ctrl+Enter 换行) - 这里可以优化体验
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
 * 历史记录管理功能 (仅存档)
 */
function saveToHistory(record) {
    const historyItem = {
        id: Date.now().toString(36),
        timestamp: new Date().toISOString(),
        prompt: record.prompt,
        resultText: record.result.text,
        // 只存第一张生成的图作为预览，避免localStorage爆炸
        thumbnail: record.result.images && record.result.images.length > 0 
            ? record.result.images[0].data 
            : null,
        mode: `${record.imageCount}图模式`
    };
    
    AppState.generationHistory.unshift(historyItem);
    if (AppState.generationHistory.length > 20) { // 减少数量防止 storage 满
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
        // 如果配额满了，清空旧的
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
        // 暂不实现点击回放，因为上下文比较复杂
        historyList.appendChild(div);
    });
}

function clearAllHistory() {
    if (!confirm('确定清空历史？')) return;
    AppState.generationHistory = [];
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

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', initializeApp);
