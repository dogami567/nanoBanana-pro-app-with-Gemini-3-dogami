/**
 * API调用模块
 * 处理与Gemini API的所有交互
 */

// API配置常量
const API_CONFIG = {
    BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
    MODELS_ENDPOINT: '/models',
    GENERATE_CONTENT_SUFFIX: ':generateContent',
    TIMEOUT: 120000, // 2分钟超时
    DEFAULT_MODELS: [
        'gemini-2.5-flash-image-preview',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-pro'
    ]
};

/**
 * 验证API密钥格式
 * @param {string} apiKey - API密钥
 * @returns {boolean} 是否为有效格式
 */
function validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
        return false;
    }
    
    // Gemini API密钥通常以AIza开头，长度约39字符
    const apiKeyPattern = /^AIza[a-zA-Z0-9_-]{35}$/;
    return apiKeyPattern.test(apiKey);
}

/**
 * 获取可用模型列表
 * @param {string} apiKey - API密钥
 * @returns {Promise<Array<string>>} 模型列表
 */
async function getAvailableModels(apiKey) {
    if (!validateApiKey(apiKey)) {
        throw new Error('无效的API密钥格式');
    }
    
    try {
        const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.MODELS_ENDPOINT}?key=${apiKey}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(10000) // 10秒超时
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('API密钥无效');
            } else if (response.status === 403) {
                throw new Error('API访问被拒绝');
            } else {
                throw new Error(`获取模型列表失败: ${response.status}`);
            }
        }
        
        const data = await response.json();
        
        if (data.models && Array.isArray(data.models)) {
            // 过滤出支持图像生成的模型
            const imageModels = data.models
                .filter(model => 
                    model.name && 
                    (model.name.includes('flash') || model.name.includes('image'))
                )
                .map(model => model.name.replace('models/', ''));
            
            return imageModels.length > 0 ? imageModels : API_CONFIG.DEFAULT_MODELS;
        }
        
        return API_CONFIG.DEFAULT_MODELS;
        
    } catch (error) {
        console.error('获取模型列表失败:', error);
        
        if (error.name === 'AbortError') {
            throw new Error('请求超时，请检查网络连接');
        }
        
        // 如果是网络错误，返回默认模型列表
        if (error.message.includes('fetch')) {
            return API_CONFIG.DEFAULT_MODELS;
        }
        
        throw error;
    }
}

/**
 * 调用Gemini API生成图片（支持上下文和混合内容）
 * @param {Object} params - 请求参数
 * @param {string} params.apiKey - API密钥
 * @param {string} params.model - 模型名称
 * @param {Array} params.history - 历史对话记录
 * @param {Array} params.newParts - 当前用户输入的parts
 * @param {Function} onProgress - 进度回调函数
 * @returns {Promise<Object>} 包含文本和图片数据的对象
 */
async function generateImageWithGemini({
    apiKey,
    model,
    history,
    newParts,
    onProgress
}) {
    // 验证必填参数
    if (!validateApiKey(apiKey)) {
        throw new Error('无效的API密钥');
    }
    
    if (!newParts || newParts.length === 0) {
        throw new Error('输入内容不能为空');
    }
    
    // 更新进度：准备请求
    if (onProgress) onProgress(10, '准备API请求...');
    
    // 构建完整的对话内容
    const contents = [
        ...history,
        { role: 'user', parts: newParts }
    ];
    
    const requestBody = {
        contents: contents,
        generationConfig: {
            temperature: 0.8,
            topK: 32,
            topP: 1,
            maxOutputTokens: 4096
        }
    };
    
    // 更新进度：发送请求
    if (onProgress) onProgress(20, '发送请求到Gemini API...');
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);
        
        const response = await fetch(
            `${API_CONFIG.BASE_URL}/models/${model}${API_CONFIG.GENERATE_CONTENT_SUFFIX}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-goog-api-key': apiKey
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            }
        );
        
        clearTimeout(timeoutId);
        
        // 更新进度：处理响应
        if (onProgress) onProgress(60, '处理API响应...');
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API请求失败 (${response.status})`;
            
            try {
                const errorData = JSON.parse(errorText);
                if (errorData.error && errorData.error.message) {
                    errorMessage = errorData.error.message;
                }
            } catch (e) {
                // 使用默认错误消息
            }
            
            if (response.status === 401) {
                errorMessage = 'API密钥无效或已过期';
            } else if (response.status === 403) {
                errorMessage = 'API访问被拒绝，请检查配额';
            } else if (response.status === 429) {
                errorMessage = '请求过于频繁，请稍后再试';
            } else if (response.status >= 500) {
                errorMessage = 'Gemini API服务暂时不可用';
            }
            
            throw new Error(errorMessage);
        }
        
        const result = await response.json();
        
        // 添加调试信息
        console.log('API响应结构:', JSON.stringify(result, null, 2));
        
        // 更新进度：解析结果
        if (onProgress) onProgress(80, '解析生成结果...');
        
        // 从响应中提取混合内容
        if (!result.candidates || result.candidates.length === 0) {
            throw new Error('API未返回任何结果');
        }
        
        const candidate = result.candidates[0];
        if (!candidate.content || !candidate.content.parts) {
            throw new Error('API返回了空内容');
        }
        
        // 解析所有parts
        const responseParts = candidate.content.parts;
        let textContent = '';
        const images = [];
        
        for (const part of responseParts) {
            if (part.text) {
                textContent += part.text;
            }
            if (part.inlineData) {
                images.push({
                    mimeType: part.inlineData.mimeType,
                    data: part.inlineData.data
                });
            }
        }
        
        // 检查是否为空响应
        if (!textContent && images.length === 0) {
             throw new Error('API生成的内容为空');
        }
        
        // 更新进度：完成
        if (onProgress) onProgress(100, '生成完成！');
        
        return {
            text: textContent,
            images: images
        };
        
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('请求超时，生成时间过长，请稍后重试');
        }
        
        console.error('API调用失败:', error);
        throw error;
    }
}

/**
 * 测试API连接
 * @param {string} apiKey - API密钥
 * @param {string} model - 模型名称
 * @returns {Promise<boolean>} 连接是否成功
 */
async function testApiConnection(apiKey, model) {
    try {
        const testPrompt = "Generate a simple test image";
        
        const response = await fetch(
            `${API_CONFIG.BASE_URL}/models/${model}${API_CONFIG.GENERATE_CONTENT_SUFFIX}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-goog-api-key': apiKey
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [{ text: testPrompt }]
                        }
                    ]
                }),
                signal: AbortSignal.timeout(10000)
            }
        );
        
        return response.ok;
    } catch (error) {
        console.error('API连接测试失败:', error);
        return false;
    }
}