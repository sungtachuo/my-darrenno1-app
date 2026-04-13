exports.handler = async (event) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const body = JSON.parse(event.body);

  // 1. 使用 v1beta 版本，這是目前對 JSON Mode 支援最完善的接口
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: body.prompt },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: body.image
                }
              }
            ]
          }
        ],
        // 2. 這是最穩定的參數組合：CamelCase 的父層 + snake_case 的子層
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.1
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