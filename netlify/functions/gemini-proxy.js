exports.handler = async (event) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const body = JSON.parse(event.body);

  // 核心修正：使用 v1 正式版路徑，這在 Google 全球伺服器是最穩定的
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: body.prompt + " \n重要：請僅回傳純 JSON 代碼塊，不要有任何解釋文字。" },
            { inlineData: { mimeType: "image/png", data: body.image } }
          ]
        }],
        // 我們完全不傳 generationConfig，徹底避開「參數未定義」的風險
      })
    });

    const data = await response.json();
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};