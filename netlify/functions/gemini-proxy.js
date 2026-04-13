exports.handler = async (event) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const body = JSON.parse(event.body);
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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
        generationConfig: { temperature: 0.1 } // 移除 responseMimeType，保證不報 400 錯誤
      })
    });
    const data = await response.json();
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};