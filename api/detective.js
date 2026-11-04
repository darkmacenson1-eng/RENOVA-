const crypto = require("crypto");

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function getEncryptionKey() {
  if (!process.env.DETECTIVE_SECRET) {
    throw new Error("DETECTIVE_SECRET manquant.");
  }

  return crypto
    .createHash("sha256")
    .update(process.env.DETECTIVE_SECRET)
    .digest();
}

function encryptState(state) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(state), "utf8"),
    cipher.final()
  ]);

  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}

function decryptState(token) {
  if (
    typeof token !== "string" ||
    token.length > 100000 ||
    token.split(".").length !== 3
  ) {
    throw new Error("Dossier invalide.");
  }

  const [iv, tag, encrypted] = token.split(".");

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(iv, "base64url")
  );

  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString("utf8"));
}

async function askGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY manquant.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.65,
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Gemini error:", error);
    throw new Error("Impossible de contacter Gemini.");
  }

  const data = await response.json();

  const text = data.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .join("");

  if (!text) {
    throw new Error("Réponse vide de Gemini.");
  }

  return JSON.parse(text);
}

function getActions(type) {
  if (type === "investigate") {
    return [
      {
        id: "inspect_scene",
        label: "Examiner le lieu"
      },
      {
        id: "inspect_clues",
        label: "Examiner les indices"
      },
      {
        id: "inspect_objects",
        label: "Examiner les objets"
      }
    ];
  }

  if (type === "research") {
    return [
      {
        id: "review_records",
        label: "Consulter les documents"
      },
      {
        id: "review_timeline",
        label: "Étudier la chronologie"
      },
      {
        id: "review_background",
        label: "Rechercher des informations"
      }
    ];
  }

  if (type === "interrogate") {
    return [
      {
        id: "interview",
        label: "Choisir une personne à interroger"
      }
    ];
  }

  return [
    ...getActions("investigate"),
    ...getActions("research"),
    ...getActions("interrogate")
  ];
}

async function createCase() {
  const prompt = `
Tu es le créateur officiel des affaires de RÉNOVA Détective.

Invente une enquête policière fictive, captivante et difficile.

Les affaires peuvent concerner :
- Un meurtre fictif sans détails graphiques.
- Une disparition.
- Un vol important.
- Une mystérieuse trahison.
- Une affaire de fraude fictive.

Crée exactement quatre suspects.

Réponds uniquement en JSON avec cette structure :

{
  "title": "Titre de l'affaire",
  "description": "Présentation du dossier",
  "introduction": "Introduction de l'enquête",
  "victim": "Nom de la victime ou personne concernée",
  "suspects": [
    {
      "id": "s1",
      "name": "Nom",
      "role": "Rôle",
      "statement": "Premier témoignage"
    },
    {
      "id": "s2",
      "name": "Nom",
      "role": "Rôle",
      "statement": "Premier témoignage"
    },
    {
      "id": "s3",
      "name": "Nom",
      "role": "Rôle",
      "statement": "Premier témoignage"
    },
    {
      "id": "s4",
      "name": "Nom",
      "role": "Rôle",
      "statement": "Premier témoignage"
    }
  ],
  "clues": [
    {
      "id": "c1",
      "title": "Titre de l'indice",
      "detail": "Description de l'indice"
    },
    {
      "id": "c2",
      "title": "Titre de l'indice",
      "detail": "Description de l'indice"
    },
    {
      "id": "c3",
      "title": "Titre de l'indice",
      "detail": "Description de l'indice"
    },
    {
      "id": "c4",
      "title": "Titre de l'indice",
      "detail": "Description de l'indice"
    }
  ],
  "culpritId": "s1",
  "motive": "Motif secret",
  "timeline": "Chronologie secrète"
}

RÈGLES :
- Le coupable doit être un des quatre suspects.
- Il doit y avoir une seule vérité.
- Les indices doivent permettre de résoudre l'affaire.
- Les témoignages doivent être cohérents.
- Le coupable doit avoir un motif crédible.
- Ne révèle jamais le coupable dans les informations publiques.
- N'utilise aucun détail graphique.
`;

  const data = await askGemini(prompt);

  if (
    !data.title ||
    !data.description ||
    !data.introduction ||
    !Array.isArray(data.suspects) ||
    data.suspects.length !== 4 ||
    !Array.isArray(data.clues) ||
    data.clues.length < 3 ||
    !data.suspects.some(s => s.id === data.culpritId)
  ) {
    throw new Error("L'affaire générée est invalide.");
  }

  return {
    id: crypto.randomUUID(),

    publicCase: {
      title: data.title,
      description: data.description,
      introduction: data.introduction,
      victim: data.victim,
      suspects: data.suspects.map(s => ({
        id: s.id,
        name: s.name,
        role: s.role,
        statement: s.statement
      })),
      clues: data.clues
    },

    secret: {
      culpritId: data.culpritId,
      motive: data.motive,
      timeline: data.timeline
    },

    history: [],
    closed: false
  };
}

async function processInvestigation(state, action, choiceId) {
  const suspectMatch = /^interview_(s[1-4])$/.exec(choiceId || "");

  let context = "";

  if (suspectMatch) {
    const suspect = state.publicCase.suspects.find(
      s => s.id === suspectMatch[1]
    );

    if (!suspect) {
      throw new Error("Personne introuvable.");
    }

    context = `
Le joueur souhaite interroger :
${JSON.stringify(suspect)}

Présente un interrogatoire intéressant.
Le suspect doit répondre en respectant son témoignage initial.
`;
  } else {
    context = `
Action du joueur : ${action}
Choix effectué : ${choiceId || "aucun"}

Donne une découverte ou une information pertinente
pour cette action.
`;
  }

  const prompt = `
Tu es le moteur narratif de RÉNOVA Détective.

AFFAIRE PUBLIQUE :
${JSON.stringify(state.publicCase)}

HISTORIQUE PUBLIC :
${JSON.stringify(state.history)}

${context}

RÈGLES IMPORTANTES :
- Respecte les informations déjà découvertes.
- Ne modifie jamais les indices existants.
- Ne change jamais les témoignages initiaux.
- Ne crée aucune contradiction.
- Ne révèle jamais l'identité du coupable.
- Ne révèle jamais le motif secret.
- Ne donne pas automatiquement la solution.
- Réponds en français.
- Laisse le joueur réfléchir.
- Aucun détail graphique.

Réponds uniquement en JSON :

{
  "message": "Réponse destinée au détective"
}
`;

  const result = await askGemini(prompt);

  if (
    !result ||
    typeof result.message !== "string" ||
    !result.message.trim()
  ) {
    throw new Error("Réponse d'enquête invalide.");
  }

  const message = result.message;

  state.history.push({
    action,
    choiceId,
    message
  });

  return message;
}

function getPublicSuspects(state) {
  return state.publicCase.suspects.map(s => ({
    id: s.id,
    name: s.name
  }));
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Méthode non autorisée."
    });
  }

  try {
    const body = req.body || {};

    const action = body.action;
    const choiceId = body.choiceId;
    const suspectId = body.suspectId;
    const caseId = body.caseId;

    if (action === "start") {
      const state = await createCase();

      return res.status(200).json({
        caseId: encryptState(state),
        title: state.publicCase.title,
        description: state.publicCase.description,
        introduction: state.publicCase.introduction,
        suspects: getPublicSuspects(state),
        actions: getActions("investigate")
      });
    }

    if (!caseId) {
      return res.status(400).json({
        error: "Aucun dossier sélectionné."
      });
    }

    const state = decryptState(caseId);

    if (state.closed) {
      return res.status(400).json({
        error: "Cette enquête est déjà terminée."
      });
    }

    if (action === "accuse") {
      const suspectExists = state.publicCase.suspects.some(
        s => s.id === suspectId
      );

      if (!suspectExists) {
        return res.status(400).json({
          error: "Suspect invalide."
        });
      }

      const won = suspectId === state.secret.culpritId;

      state.closed = true;

      return res.status(200).json({
        caseId: encryptState(state),

        verdict: won
          ? "Bravo, détective ! Tu as identifié le bon suspect. Tu remportes cette enquête !"
          : "Le vrai coupable s'est échappé. Désolé, tu n'as pas gagné cette enquête.",

        won
      });
    }

    if (
      !["investigate", "research", "interrogate", "choose"].includes(action)
    ) {
      return res.status(400).json({
        error: "Action inconnue."
      });
    }

    if (
      choiceId &&
      !/^(inspect_scene|inspect_clues|inspect_objects|review_records|review_timeline|review_background|interview_s[1-4])$/.test(choiceId)
    ) {
      return res.status(400).json({
        error: "Choix invalide."
      });
    }

    const message = await processInvestigation(
      state,
      action,
      choiceId
    );

    return res.status(200).json({
      caseId: encryptState(state),
      message,
      actions: getActions(
        action === "choose" ? "investigate" : action
      )
    });

  } catch (error) {
    console.error("RÉNOVA Détective:", error);

    return res.status(500).json({
      error: "Une erreur est survenue dans le moteur d'enquête."
    });
  }
};
