const axios = require("axios");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

async function generateAIResponse({
    systemPrompt,
    userPrompt,
    temperature = 0.7,
}) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL;

    if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY is missing from .env");
    }

    if (!model) {
        throw new Error("OPENROUTER_MODEL is missing from .env");
    }

    const response = await axios.post(
        OPENROUTER_URL,
        {
            model,
            messages: [
                {
                    role: "system",
                    content: systemPrompt,
                },
                {
                    role: "user",
                    content: userPrompt,
                },
            ],
            temperature,
        },
        {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            timeout: 60000,
        }
    );

    const content = response.data?.choices?.[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
        throw new Error("The AI provider returned an empty response.");
    }

    return content.trim();
}

module.exports = { generateAIResponse };