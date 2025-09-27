const axios = require("axios");

// Free LibreTranslate instance (you can self-host if needed)
const API_URL = "https://libretranslate.de/translate";

async function translateText(text, targetLang = "en") {
  if (!text || text.trim() === "") return "";
  try {
    const response = await axios.post(API_URL, {
      q: text,
      source: "auto",
      target: targetLang,
      format: "text",
    });
    return response.data.translatedText;
  } catch (error) {
    console.error("Translation error:", error.message);
    return text; // fallback to original
  }
}

module.exports = { translateText };
