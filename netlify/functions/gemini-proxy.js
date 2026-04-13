exports.handler = async (event) => {
  // 1. 從 Netlify 環境變數獲取金鑰
  const apiKey = process.env.GEMINI_API_KEY;
  
  // 2. 解析前端傳來的圖片與指令
  const body = JSON.parse(event.body);

  // 3. 定義 Google Gemini 1.5 Flash 的通訊地址 (API Endpoint)
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    // 4. 發送請求給 Google
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: body.prompt }, // 您的分析指令
              {
                inlineData: {
                  mimeType: "image/png", // 預設圖片格式
                  data: body.image // 這是前端傳來的 Base64 數據
                }
              }
            ]
          }
        ],
        generationConfig: {
          response_mime_type: "application/json", // 強制要求回傳純 JSON
          temperature: 0.1 // 降低隨機性，確保結果精確
        }
      })
    });

    const data = await response.json();
    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};