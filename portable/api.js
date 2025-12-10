/**
 * API调用模块
 * 处理与Gemini API的所有交互
 */

// API配置常量
const API_CONFIG = {
    BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
    MODELS_ENDPOINT: '/models',
    GENERATE_CONTENT_SUFFIX: ':generateContent',
    TIMEOUT: 600000, // 10分钟超时
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
 * 调用Gemini API生成图片
 * @param {Object} params - 请求参数
 * @param {string} params.apiKey - API密钥
 * @param {string} params.model - 模型名称
 * @param {string} params.prompt - 提示词
 * @param {string} params.leftImageBase64 - 左图Base64数据（可选）
 * @param {string} params.leftImageMimeType - 左图MIME类型（可选）
 * @param {string} params.rightImageBase64 - 右图Base64数据（可选）
 * @param {string} params.rightImageMimeType - 右图MIME类型（可选）
 * @param {Function} onProgress - 进度回调函数
 * @returns {Promise<string>} 生成的图片Base64数据
 */
async function generateImageWithGemini({
    apiKey,
    model,
    prompt,
    leftImageBase64,
    leftImageMimeType,
    rightImageBase64,
    rightImageMimeType,
    onProgress
}) {
    // 验证必填参数
    if (!validateApiKey(apiKey)) {
        throw new Error('无效的API密钥');
    }
    
    if (!prompt || prompt.trim().length === 0) {
        throw new Error('提示词不能为空');
    }
    
    // 检查图片数量，支持单图或双图模式
    const hasLeftImage = leftImageBase64 && leftImageBase64.length > 0;
    const hasRightImage = rightImageBase64 && rightImageBase64.length > 0;
    
    if (!hasLeftImage && !hasRightImage) {
        throw new Error('请先上传至少一张图片');
    }
    
    // 更新进度：准备请求
    if (onProgress) onProgress(10, '准备API请求...');
    
    // 构建请求数据 - 动态添加图片
    const parts = [{ text: prompt }];
    
    // 添加可用的图片
    if (hasLeftImage) {
        parts.push({
            inline_data: {
                mime_type: leftImageMimeType,
                data: leftImageBase64
            }
        });
    }
    
    if (hasRightImage) {
        parts.push({
            inline_data: {
                mime_type: rightImageMimeType,
                data: rightImageBase64
            }
        });
    }
    
    const requestBody = {
        contents: [{ parts }],
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
        
        // 添加调试信息：记录完整的API响应结构
        console.log('API响应结构:', JSON.stringify(result, null, 2));
        
        // 更新进度：提取图片数据
        if (onProgress) onProgress(80, '提取生成的图片...');
        
        // 从响应中提取图片数据 - 支持流式和混合内容
        if (!result.candidates || result.candidates.length === 0) {
            throw new Error('API未返回任何结果');
        }
        
        // 遍历所有候选结果查找图片数据
        let imageData = null;
        let allTextContent = [];
        
        for (const candidate of result.candidates) {
            if (!candidate.content || !candidate.content.parts) {
                continue;
            }
            
            for (const part of candidate.content.parts) {
                // 调试：记录每个part的内容
                console.log('Part内容:', part);
                
                // 收集所有文字内容
                if (part.text !== undefined) {
                    allTextContent.push(part.text);
                    console.log('发现文字内容:', JSON.stringify(part.text));
                }
                
                // 查找图片数据（优先获取第一个找到的图片）
                if (!imageData && part.inlineData && part.inlineData.data) {
                    imageData = part.inlineData.data;
                    console.log('找到图片数据，MIME类型:', part.inlineData.mimeType);
                }
            }
            
            // 如果已经找到图片，可以继续收集文字但不需要再找图片
            if (imageData) {
                break;
            }
        }
        
        if (!imageData) {
            // 提供详细的错误信息，包含API的实际回复
            if (allTextContent.length > 0) {
                const fullText = allTextContent.join(' ').trim();
                
                // 检查是否是空内容或只包含空白字符
                if (!fullText || fullText.length === 0) {
                    throw new Error('API返回了空的文字内容，未生成图片。请尝试:\n1. 确保提示词明确要求生成或编辑图片\n2. 检查输入图片是否清晰有效\n3. 尝试更具体的图片生成指令');
                }
                
                // 显示实际内容，包括特殊字符的可见形式
                const displayText = fullText.replace(/\s/g, '·').substring(0, 200);
                throw new Error(`API返回了文字内容而非图片。这可能是因为:\n1. 提示词需要明确要求生成图片\n2. 输入图片无法处理\n3. API临时无法生成图片\n\nAPI回复内容: "${displayText}${fullText.length > 200 ? '...' : ''}"\n(·代表空格/换行符)`);
            }
            throw new Error('API未生成任何内容，请检查提示词和输入图片');
        }
        
        // 记录混合内容用于调试
        if (allTextContent.length > 0) {
            console.log('API返回的文字内容:', allTextContent.join('\n'));
        }
        
        // 更新进度：完成
        if (onProgress) onProgress(100, '图片生成完成！');
        
        return imageData;
        
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
