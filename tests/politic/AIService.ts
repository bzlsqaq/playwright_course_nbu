const axios = require('axios');

// 配置信息
const API_URL = 'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions';
const API_KEY = '';

/**
 * 调用方舟 Coding 接口
 */
export async function callAIResponse(prompt: string) {
  try {
    const response = await axios.post(API_URL, {
      model: 'claude-3-5-sonnet',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 4096,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    // 这里的错误处理保持异步捕获习惯
    const errorData = error.response?.data || error.message;
    console.error('调用失败:', errorData);
    throw error;
  }
}

/**
 * 程序入口 - 异步改写
 */
if (require.main === module) {
  (async () => {
    const userPrompt = 'hello';
    
    try {
      console.log('正在请求...');
      const result = await callAIResponse(userPrompt);
      
      console.log('返回结果:');
      console.log(result.choices[0].message.content);
    } catch (err) {
      // 捕获 callArkCoding 中 throw 出来的错误
      process.exit(1);
    }
  })();
}

