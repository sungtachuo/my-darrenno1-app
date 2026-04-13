exports.handler = async (event) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const body = JSON.parse(event.body);

  // 使用 v1 正式版穩定路徑
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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
                inlineData: { // 👈 這裡必須是大寫 D
                  mimeType: "image/png", // 👈 這裡必須是大寫 T
                  data: body.image
                }
              }
            ]
          }
        ],
        generationConfig: { // 👈 這裡必須是大寫 C
          responseMimeType: "application/json", // 👈 這裡必須是大寫 M 和 T，且無底線
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