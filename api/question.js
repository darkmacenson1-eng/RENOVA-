export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      message: "Méthode non autorisée."
    });
  }

  const apiKey = process.env.RENOVA;

  if (!apiKey) {
    return res.status(500).json({
      message: "La clé Gemini n'est pas configurée sur Vercel."
    });
  }

  try {
    const { action, parcoursId, reponse } = req.body || {};

    if (!action || !["commencer", "repondre"].includes(action)) {
      return res.status(400).json({
        message: "Action invalide."
      });
    }

    if (action === "repondre" && !String(reponse || "").trim()) {
      return res.status(400).json({
        message: "Écris une réponse avant de continuer."
      });
    }

    const instruction = `
Tu es RÉNOVA, un assistant de réflexion et de soutien destiné aux jeunes.
Tu poses une question à la fois, avec bienveillance et sans jugement.
Adapte chaque nouvelle question à la réponse précédente.
Ne poses pas de questions scolaires ou de culture générale.
Ne fais aucun diagnostic médical ou psychologique.
Les réponses sont volontaires : le participant peut arrêter ou passer une question.
Quand tu as suffisamment d'informations, termine le parcours et propose
des conseils personnalisés, simples et encourageants.
Ne présente jamais de score, de niveau de gravité ou d'étiquette.

Action : ${action}
Réponse précédente : ${String(reponse || "").slice(0, 3000)}

Réponds uniquement en JSON avec cette structure :
{
  "question": "La prochaine question, ou le bilan final",
  "termine": false,
  "message": ""
}

Si le parcours est terminé, mets "termine" à true.
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: instruction }]
          }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Erreur Gemini :", data);
      return res.status(502).json({
        message: "Gemini n'a pas pu répondre. Réessaie plus tard."
      });
    }

    const texte = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!texte) {
      throw new Error("Réponse vide de Gemini.");
    }

    const resultat = JSON.parse(texte);

    return res.status(200).json({
      parcoursId: parcoursId || "nouveau-parcours",
      question: resultat.question || "",
      termine: Boolean(resultat.termine),
      message: resultat.message || ""
    });

  } catch (error) {
    console.error("Erreur RÉNOVA :", error);
    return res.status(500).json({
      message: "Une erreur est survenue. Réessaie plus tard."
    });
  }
}
