/**
 * API 调用模块
 * 负责与 Gemini / Nano Banana 图像服务交互
 */

// API 配置常量
const API_CONFIG = {
    DEFAULT_BASE_URL: 'https://api.linkapi.org',
    MODELS_ENDPOINT: '/v1beta/models',
    GEMINI_GENERATE_SUFFIX: ':generateContent',
    TIMEOUT: 120000, // 2 分钟超时
    DEFAULT_MODELS: [
        'nano-banana-2-4k',
        'gemini-2.5-flash-image-preview',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-pro'
    ]
};

/**
 * 规范化 Base URL，确保为 Origin（去掉 /v1beta 等路径，去掉末尾斜杠）
 * @param {string} baseUrl
 * @returns {string}
 */
function normalizeBaseUrl(baseUrl) {
    let url = (baseUrl || API_CONFIG.DEFAULT_BASE_URL || '').trim();
    if (!url) url = API_CONFIG.DEFAULT_BASE_URL;

    // 去掉末尾斜杠
    url = url.replace(/\/+$/, '');

    // 去掉尾部的 /v1beta 或 /v1 等路径，得到 Origin
    url = url.replace(/\/v1beta(?:\/.*)?$/i, '');
    url = url.replace(/\/v1(?:\/.*)?$/i, '');

    return url;
}

/**
 * 验证 API 密钥格式
 * @param {string} apiKey
 * @returns {boolean}
 */
function validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') return false;
    // 支持 Google 官方 key (AIza...) 及第三方 key (sk-...)
    return apiKey.length > 10;
}

/**
 * 获取可用模型列表
 * @param {string} apiKey
 * @param {string} baseUrl - API 域名（Origin），例如 https://api.linkapi.org
 * @returns {Promise<string[]>}
 */
async function getAvailableModels(apiKey, baseUrl) {
    if (!validateApiKey(apiKey)) {
        throw new Error('无效的API密钥格式');
    }

    const origin = normalizeBaseUrl(baseUrl);
    const url = `${origin}${API_CONFIG.MODELS_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(10000)
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
        if (Array.isArray(data.models)) {
            const imageModels = data.models
                .filter(model => model.name && (model.name.includes('flash') || model.name.includes('image')))
                .map(model => model.name.replace('models/', ''));

            return imageModels.length > 0 ? imageModels : API_CONFIG.DEFAULT_MODELS;
        }

        return API_CONFIG.DEFAULT_MODELS;
    } catch (error) {
        console.error('获取模型列表失败:', error);

        if (error.name === 'AbortError') {
            throw new Error('请求超时，请检查网络连接');
        }

        // 网络错误时退回默认模型列表
        if (error.message && error.message.includes('fetch')) {
            return API_CONFIG.DEFAULT_MODELS;
        }

        throw error;
    }
}

// ---------- Nano Banana (OpenAI Chat 格式) 辅助函数 ----------

/**
 * 将 Gemini 的 parts 转为 OpenAI Chat 的 content 数组
 * @param {Array} newParts
 * @returns {{contentParts: Array, prompt: string}}
 */
function buildOpenAIContentFromGeminiParts(newParts) {
    const contentParts = [];
    let prompt = '';

    for (const part of newParts) {
        if (part.text) {
            contentParts.push({
                type: 'text',
                text: part.text
            });
            if (!prompt) {
                prompt = part.text;
            }
        } else if ((part.inlineData && part.inlineData.data) || (part.inline_data && part.inline_data.data)) {
            const inline = part.inlineData || part.inline_data;
            const mimeType = inline.mimeType || inline.mime_type || 'image/png';
            const base64Data = inline.data;
            const dataUrl = `data:${mimeType};base64,${base64Data}`;

            contentParts.push({
                type: 'image_url',
                image_url: {
                    url: dataUrl
                }
            });
        }
    }

    if (!prompt) {
        prompt = 'A creative image';
        contentParts.unshift({
            type: 'text',
            text: prompt
        });
    }

    return { contentParts, prompt };
}

/**
 * 从文本中提取图片 URL（支持 Markdown 和裸 URL）
 * @param {string} text
 * @returns {string|null}
 */
function extractImageUrlFromText(text) {
    if (!text) return null;

    // 优先匹配 Markdown: ![alt](url)
    const markdownMatch = text.match(/!\[[^\]]*]\((https?:\/\/[^\s)]+)\)/);
    if (markdownMatch && markdownMatch[1]) {
        return markdownMatch[1];
    }

    // 退化为直接 URL 匹配
    const urlMatch = text.match(/https?:\/\/[^\s)]+/);
    return urlMatch ? urlMatch[0] : null;
}

/**
 * 将 Blob 转为 base64（data URL）
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * 下载远程图片并转为 { mimeType, data(base64) }
 * @param {string} url
 * @returns {Promise<{mimeType: string, data: string}>}
 */
async function fetchImageAsBase64(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`下载图片失败: ${res.status} ${res.statusText}`);
    }

    const blob = await res.blob();
    const dataUrl = await blobToBase64(blob);

    const commaIndex = typeof dataUrl === 'string' ? dataUrl.indexOf(',') : -1;
    const base64 = commaIndex !== -1 ? dataUrl.slice(commaIndex + 1) : dataUrl;
    const mimeType = blob.type || 'image/png';

    return { mimeType, data: base64 };
}

/**
 * 调用 Nano Banana (通过 linkapi chat/completions) 生成图片 URL 并下载为 base64
 * @param {Object} params
 * @param {string} params.apiKey
 * @param {Array} params.newParts
 * @param {Function} params.onProgress
 * @param {string} params.baseUrl
 * @returns {Promise<{text: string, images: Array}>}
 */
async function callNanoBananaChatCompletions({ apiKey, newParts, onProgress, baseUrl }) {
    if (onProgress) onProgress(10, '正在连接 Nano Banana 绘图服务...');

    const { contentParts, prompt } = buildOpenAIContentFromGeminiParts(newParts);

    const requestBody = {
        model: 'nano-banana-2-4k',
        messages: [
            {
                role: 'user',
                content: contentParts
            }
        ]
    };

    if (onProgress) onProgress(30, '正在生成图片...');

    const origin = normalizeBaseUrl(baseUrl);
    const url = `${origin}/v1/chat/completions`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Nano Banana API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();

    if (onProgress) onProgress(60, '解析生成结果文本...');

    if (!data.choices || data.choices.length === 0 || !data.choices[0].message) {
        throw new Error('API未返回有效结果');
    }

    const rawContent = data.choices[0].message.content;
    const textContent =
        typeof rawContent === 'string'
            ? rawContent
            : Array.isArray(rawContent)
                ? rawContent.map(c => (typeof c === 'string' ? c : c.text || '')).join('\n')
                : '';

    if (!textContent) {
        throw new Error('API返回内容为空');
    }

    const imageUrl = extractImageUrlFromText(textContent);
    const images = [];

    if (imageUrl) {
        if (onProgress) onProgress(80, '正在下载生成图片...');
        try {
            const image = await fetchImageAsBase64(imageUrl);
            images.push(image);
        } catch (downloadError) {
            console.error('下载图片失败:', downloadError);
        }
    }

    if (onProgress) onProgress(100, '生成完成');

    return {
        text: textContent,
        images
    };
}

// ---------- Gemini 主流程 ----------

/**
 * 调用 Gemini / Nano Banana 生成图片（支持上下文和混合内容）
 * @param {Object} params
 * @param {string} params.apiKey
 * @param {string} params.model
 * @param {Array} params.history
 * @param {Array} params.newParts
 * @param {Function} params.onProgress
 * @param {string} params.baseUrl
 * @returns {Promise<{text: string, images: Array}>}
 */
async function generateImageWithGemini({
    apiKey,
    model,
    history = [],
    newParts = [],
    onProgress,
    baseUrl
}) {
    if (!validateApiKey(apiKey)) {
        throw new Error('无效的API密钥');
    }

    if (!newParts || newParts.length === 0) {
        throw new Error('输入内容不能为空');
    }

    // 兼容 newParts 中可能存在的 inline_data 形式，统一为 Gemini 所需的 inlineData
    const normalizedParts = newParts.map(part => {
        if ((part.inlineData && part.inlineData.data) || (part.inline_data && part.inline_data.data)) {
            const inline = part.inlineData || part.inline_data;
            return {
                inlineData: {
                    mimeType: inline.mimeType || inline.mime_type || 'image/png',
                    data: inline.data
                }
            };
        }
        if (part.text) {
            return { text: part.text };
        }
        return part;
    });

    // 特殊模型：走 OpenAI Chat Completions 协议
    if (model === 'nano-banana-2-4k') {
        try {
            return await callNanoBananaChatCompletions({
                apiKey,
                newParts: normalizedParts,
                onProgress,
                baseUrl
            });
        } catch (error) {
            console.error('Nano Banana 调用失败:', error);
            throw error;
        }
    }

    // --- 标准处理：Gemini 协议 ---

    if (onProgress) onProgress(10, '准备API请求...');

    const contents = [
        ...(Array.isArray(history) ? history : []),
        { role: 'user', parts: normalizedParts }
    ];

    const requestBody = {
        contents,
        generationConfig: {
            temperature: 0.8,
            topK: 32,
            topP: 1,
            maxOutputTokens: 4096
        }
    };

    if (onProgress) onProgress(20, '发送请求到Gemini API...');

    const origin = normalizeBaseUrl(baseUrl);
    const url = `${origin}${API_CONFIG.MODELS_ENDPOINT}/${model}${API_CONFIG.GEMINI_GENERATE_SUFFIX}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-goog-api-key': apiKey
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (onProgress) onProgress(60, '处理API响应...');

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API请求失败 (${response.status})`;

            try {
                const errorData = JSON.parse(errorText);
                if (errorData.error && errorData.error.message) {
                    errorMessage = errorData.error.message;
                }
            } catch (_) {
                // 忽略 JSON 解析错误，使用默认错误信息
            }

            if (response.status === 401) {
                errorMessage = 'API密钥无效或已过期';
            } else if (response.status === 403) {
                errorMessage = 'API访问被拒绝，请检查配置';
            } else if (response.status === 429) {
                errorMessage = '请求过于频繁，请稍后再试';
            } else if (response.status >= 500) {
                errorMessage = 'Gemini API 服务暂时不可用';
            }

            throw new Error(errorMessage);
        }

        const result = await response.json();

        console.log('Gemini API 响应结构:', JSON.stringify(result, null, 2));

        if (onProgress) onProgress(80, '解析生成结果...');

        if (!result.candidates || result.candidates.length === 0) {
            throw new Error('API未返回任何结果');
        }

        const candidate = result.candidates[0];
        if (!candidate.content || !candidate.content.parts) {
            throw new Error('API返回了空内容');
        }

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

        if (!textContent && images.length === 0) {
            throw new Error('API生成的内容为空');
        }

        if (onProgress) onProgress(100, '生成完成');

        return {
            text: textContent,
            images
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('请求超时，生成时间过长，请稍后重试');
        }

        console.error('Gemini API 调用失败:', error);
        throw error;
    }
}

/**
 * 测试 API 连接（使用 Gemini 路径，Base URL 可选）
 * @param {string} apiKey
 * @param {string} model
 * @param {string} baseUrl
 * @returns {Promise<boolean>}
 */
async function testApiConnection(apiKey, model, baseUrl) {
    try {
        const testPrompt = 'Generate a simple test image';
        const origin = normalizeBaseUrl(baseUrl);
        const url = `${origin}${API_CONFIG.MODELS_ENDPOINT}/${model}${API_CONFIG.GEMINI_GENERATE_SUFFIX}`;

        const response = await fetch(url, {
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
        });

        return response.ok;
    } catch (error) {
        console.error('API连接测试失败:', error);
        return false;
    }
}

