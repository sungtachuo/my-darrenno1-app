exports.handler = async (event) => {
  const apiKey = process.env.GEMINI_API_KEY;
  
  // 1. 安全檢查：如果沒讀到金鑰，立刻報錯，不再盲目發送
  if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: "金鑰未設定：請確認 Netlify 環境變數 GEMINI_API_KEY 是否正確。" }) 
    };
  }

  const body = JSON.parse(event.body);

  // 2. 使用 v1beta 搭配最純淨的模型名稱
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  // 3. 清理 Base64 前綴，避免格式不合
  const cleanImage = body.image.includes("base64,") ? body.image.split("base64,")[1] : body.image;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: body.prompt + "\n\n請務必僅以純 JSON 格式回應，不需解釋文字。" },
            { inlineData: { mimeType: "image/png", data: cleanImage } }
          ]
        }],
        // 關鍵：不傳送 generationConfig。這能避開所有命名規則（底線、大小寫）導致的報錯
      })
    });

    const data = await response.json();
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};