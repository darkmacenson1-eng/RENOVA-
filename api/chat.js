export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  try {
    const { message } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Écris un message pour RÉNOVA IA." });
    }

    if (message.length > 4000) {
      return res.status(400).json({ error: "Ton message est trop long." });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "La clé Gemini n'est pas configurée." });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text: "Tu es RÉNOVA IA, un assistant chaleureux qui aide les jeunes à découvrir leurs capacités, développer leurs idées en projets et trouver des ressources utiles. Réponds en français, clairement, avec bienveillance et des conseils pratiques."
            }]
          },
          contents: [{
            role: "user",
            parts: [{ text: message.trim() }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 800
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);
      return res.status(502).json({ error: "Gemini n'a pas pu répondre. Réessaie plus tard." });
    }

    const answer = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!answer) {
      return res.status(502).json({ error: "RÉNOVA IA n'a pas reçu de réponse." });
    }

    return res.status(200).json({ answer });
  } catch (error) {
    console.error("RÉNOVA IA error:", error);
    return res.status(500).json({ error: "Une erreur est survenue. Réessaie." });
  }
}
