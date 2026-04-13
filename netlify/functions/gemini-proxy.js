exports.handler = async (event) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const body = JSON.parse(event.body);

  // 1. 回歸正式穩定版 v1，這是全球最保險的路徑
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  // 2. 清理圖片數據（避免前綴干擾）
  const cleanBase64 = body.image.includes("base64,") ? body.image.split("base64,")[1] : body.image;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: body.prompt + " \n重要：請僅回傳 JSON 代碼塊，不要有任何解釋文字。" },
            { inlineData: { mimeType: "image/png", data: cleanBase64 } }
          ]
        }]
        // 關鍵：完全移除 generationConfig，徹底避開「Unknown field」報錯
      })
    });

    const data = await response.json();
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};