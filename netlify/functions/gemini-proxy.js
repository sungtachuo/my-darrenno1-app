exports.handler = async (event) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const body = JSON.parse(event.body);

  // 關鍵修正：換回 v1beta，保證能找到 gemini-1.5-flash
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: body.prompt + " \n重要：請僅回傳 JSON 代碼塊，不要有任何解釋文字。" },
            { inlineData: { mimeType: "image/png", data: body.image } }
          ]
        }],
        generationConfig: { temperature: 0.1 } // 移除所有會報錯的 MIME 參數
      })
    });
    const data = await response.json();
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};