/**
 * 主应用程序脚本
 * 遵循SOLID原则和完整实现原则
 */

// 应用状态管理
const AppState = {
    apiKey: '',
    selectedModel: 'nano-banana-2-4k',
    isGenerating: false,
    isSidebarOpen: false,
    generationHistory: [], // 仅仅用于本地存储历史查看，不用于对话上下文（如果需要上下文，单独维护）
    conversationHistory: [], // 用于发送给API的对话上下文
    currentImages: [], // 当前待发送的图片数组 {base64, file}
    activeHistoryId: null
};

// DOM元素引用
const DOMElements = {
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
    
    // 检查生成按钮状态
    updateGenerateButtonState();
    
    // 从localStorage恢复API密钥和历史记录
    restoreApiKeyFromStorage();
    loadHistoryFromStorage();
    
    // 初始化历史记录显示
    updateHistoryDisplay();
    
    showNotification('应用初始化完成', 'success');
}

/**
 * 绑定所有事件监听器
 */
function bindEventListeners() {
    // API密钥输入事件
    DOMElements.apiKeyInput.addEventListener('input', debounce(handleApiKeyChange, 300));
    
    // 模型选择事件
    DOMElements.modelSelect.addEventListener('change', handleModelChange);
    
    // Prompt输入事件
    DOMElements.promptInput.addEventListener('input', debounce(updateGenerateButtonState, 300));
    
    // 多图上传事件
    DOMElements.multiImageInput.addEventListener('change', handleMultiImageUpload);

    // 阻止全局拖拽事件
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // 添加键盘粘贴事件监听
    document.addEventListener('paste', handlePasteEvent);
    
    // 添加键盘快捷键说明
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

/**
 * 处理多图上传
 * @param {Event} event - 文件输入事件
 */
async function handleMultiImageUpload(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    await processFiles(files);
    DOMElements.multiImageInput.value = ''; // 清空input以便重复选择同名文件
}

/**
 * 处理文件数组
 */
async function processFiles(files) {
    let addedCount = 0;
    
    for (const file of files) {
        // 检查数量限制
        if (AppState.currentImages.length >= 5) {
            showNotification('最多只能上传5张图片', 'warning');
            break;
        }
        
        if (!validateImageFile(file)) continue;
        
        try {
            const base64Data = await fileToBase64(file);
            const imageObj = {
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                file: file,
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
        <button class="remove-img-btn" onclick="removeImage('${imageObj.id}')">✕</button>
    `;
    
    DOMElements.imagePreviewGrid.appendChild(div);
    DOMElements.clearAllImagesBtn.style.display = 'block';
}

/**
 * 移除单张图片
 */
function removeImage(id) {
    AppState.currentImages = AppState.currentImages.filter(img => img.id !== id);
    const el = document.getElementById(`preview-${id}`);
    if (el) el.remove();
    
    updateImageCount();
    updateGenerateButtonState();
    
    if (AppState.currentImages.length === 0) {
        DOMElements.clearAllImagesBtn.style.display = 'none';
    }
}

/**
 * 清空所有图片
 */
function clearAllImages() {
    AppState.currentImages = [];
    DOMElements.imagePreviewGrid.innerHTML = '';
    DOMElements.clearAllImagesBtn.style.display = 'none';
    updateImageCount();
    updateGenerateButtonState();
    showNotification('所有图片已清空', 'info');
}

/**
 * 更新图片计数显示
 */
function updateImageCount() {
    DOMElements.imageCount.textContent = AppState.currentImages.length;
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
 * 处理模型选择变化
 */
function handleModelChange() {
    AppState.selectedModel = DOMElements.modelSelect.value;
    updateGenerateButtonState();
}

/**
 * 从localStorage恢复API密钥
 */
function restoreApiKeyFromStorage() {
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
        
        const models = await getAvailableModels(AppState.apiKey);
        
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
 * 更新生成按钮状态
 */
function updateGenerateButtonState() {
    const hasApiKey = AppState.apiKey && AppState.apiKey.length > 0;
    const hasPrompt = DOMElements.promptInput.value.trim().length > 0;
    const isNotGenerating = !AppState.isGenerating;
    
    // 新逻辑：有prompt即可，图片是可选的（虽然通常需要）
    // 但为了体验，我们还是要求至少有图或有字，这里保留原有逻辑的变体
    const canGenerate = hasApiKey && hasPrompt && isNotGenerating;
    
    DOMElements.generateBtn.disabled = !canGenerate;
    
    const imageCount = AppState.currentImages.length;
    
    if (!hasApiKey) {
        DOMElements.generateBtn.textContent = '🔑 请输入API密钥';
    } else if (!hasPrompt) {
        DOMElements.generateBtn.textContent = '✍️ 请输入提示词';
    } else if (AppState.isGenerating) {
        DOMElements.generateBtn.textContent = '⏳ 生成中...';
    } else {
        DOMElements.generateBtn.textContent = `🚀 发送消息 (${imageCount}图)`;
    }
}

/**
 * 生成图像主函数（处理多轮对话）
 */
async function generateImage() {
    if (AppState.isGenerating) return;
    
    try {
        AppState.isGenerating = true;
        updateGenerateButtonState();
        
        // 显示结果区域
        DOMElements.resultSection.style.display = 'block';
        
        const prompt = DOMElements.promptInput.value.trim();
        
        // 构造当前轮次的 parts
        const newParts = [{ text: prompt }];
        AppState.currentImages.forEach(img => {
            newParts.push({
                inline_data: {
                    mime_type: img.mimeType,
                    data: img.base64
                }
            });
        });
        
        // 1. 在聊天流中显示用户消息
        renderMessage('user', { text: prompt, images: AppState.currentImages });
        
        // 滚动到底部
        DOMElements.chatStream.scrollTop = DOMElements.chatStream.scrollHeight;

        // 显示进度条（可选，或者用loading气泡）
        DOMElements.progressSection.style.display = 'block';
        
        // 调用API
        const result = await generateImageWithGemini({
            apiKey: AppState.apiKey,
            model: AppState.selectedModel,
            history: AppState.conversationHistory,
            newParts: newParts,
            onProgress: updateProgress
        });
        
        // 2. 将当前交互加入历史上下文
        // 注意：发给API的历史中，images不需要每次都发base64吗？Gemini API通常是无状态的，
        // 除非使用 cachedContent。标准的 chat session 做法是把历史都带上。
        // 为了节省token，如果之前的轮次已经发过图，后续是否可以省略？
        // 简单起见，我们把这次完整的 user parts 存入历史。
        // 但要注意 base64 会消耗大量 token，多轮对话带多图可能会很快超限。
        // 这是一个权衡。这里先完整存储。
        
        AppState.conversationHistory.push({ role: 'user', parts: newParts });
        
        // 构造 model 的 parts
        const modelParts = [];
        if (result.text) modelParts.push({ text: result.text });
        // API返回的图片在 result.images 里（这是我们处理过的结构，不是原始API结构）
        // 我们需要转回 API 的 parts 结构存入历史吗？
        // model 生成的图片通常不需要发回给 model 作为历史（除非是多模态输入给 model 认图）
        // 但为了保持对话连贯，我们存入 text。图片通常作为 assistant 的输出展示给用户看，
        // 而在 API 历史中，model 的回复通常只包含 text。 
        // 如果 model 发了图，我们在历史里怎么记？Gemini 目前主要还是 text-to-image 或 image-to-text。
        // 如果是 image generation，模型返回的是 text 还是直接 image？
        // 根据 api.js 的逻辑，如果返回 inlineData，那是生成的图。
        // 我们只把 text 存入历史即可，生成的图不需要回传。
        if (result.text) {
             AppState.conversationHistory.push({ role: 'model', parts: [{ text: result.text }] });
        } else {
            // 如果只有图没有字，可能需要存一个占位符，否则历史可能会乱？
            // 或者就不存这一轮 model 的回复进历史（如果纯图）。
            // 为了安全，存个 "Image generated."
             AppState.conversationHistory.push({ role: 'model', parts: [{ text: "[Image Generated]" }] });
        }

        // 3. 在聊天流中显示 AI 回复
        renderMessage('model', result);
        
        // 保存到本地历史记录（仅作存档，不用于上下文）
        saveToHistory({
            prompt: prompt,
            result: result,
            imageCount: AppState.currentImages.length,
            model: AppState.selectedModel
        });
        
        // 清空输入和当前图片
        DOMElements.promptInput.value = '';
        // 可选：发完是否清空图片？通常聊天软件发完图就没了。
        clearAllImages(); 
        
    } catch (error) {
        console.error('生成失败:', error);
        showNotification(`生成失败: ${error.message}`, 'error');
        renderMessage('model', { text: `❌ 错误: ${error.message}` });
    } finally {
        AppState.isGenerating = false;
        DOMElements.progressSection.style.display = 'none';
        updateGenerateButtonState();
        // 再次滚动到底部
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
