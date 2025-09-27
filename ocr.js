const Tesseract = require("tesseract.js");

async function runOCR(imageUrl) {
  try {
    const { data } = await Tesseract.recognize(imageUrl, "chi_sim");
    return data.text.trim();
  } catch (error) {
    console.error("OCR error:", error.message);
    return "";
  }
}

module.exports = { runOCR };
