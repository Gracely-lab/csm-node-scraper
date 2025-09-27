const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");
const { runOCR } = require("./ocr");
const { translateText } = require("./translator");
const settings = require("./settings.json");

const app = express();
app.use(cors());
app.use(express.json());

// --- WooCommerce API Setup ---
const wooApi = axios.create({
  baseURL: `${settings.woocommerce.url}/wp-json/wc/v3`,
  auth: {
    username: settings.woocommerce.consumer_key,
    password: settings.woocommerce.consumer_secret,
  },
});

// --- Scrape + OCR + Translation ---
app.post("/scrape", async (req, res) => {
  try {
    const { url, language } = req.body;
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    let title = $("title").text() || "Untitled";

    // Collect images
    let images = [];
    $("img").each((_, img) => {
      let src = $(img).attr("src");
      if (src) images.push(src);
    });

    // OCR + Translate on all images
    let imageData = [];
    for (let src of images) {
      try {
        const ocrText = await runOCR(src);
        const translatedText = ocrText
          ? await translateText(ocrText, language || "en")
          : "";
        imageData.push({ src, ocrText, translatedText });
      } catch (e) {
        console.warn("OCR failed for image:", src, e.message);
        imageData.push({ src, ocrText: "", translatedText: "" });
      }
    }

    // Translate title
    const translatedTitle = await translateText(title, language || "en");

    res.json({
      title: translatedTitle,
      images: imageData,
      source: url,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Add Product to WooCommerce ---
app.post("/import", async (req, res) => {
  try {
    const { name, images, description, price, imageData } = req.body;

    // Merge OCR-translated texts into description
    let extraText = "";
    if (imageData && imageData.length > 0) {
      extraText =
        "<br><h4>Image Texts:</h4><ul>" +
        imageData
          .map(
            (img) =>
              `<li><b>${img.src}</b>: ${img.translatedText || img.ocrText}</li>`
          )
          .join("") +
        "</ul>";
    }

    const product = {
      name,
      type: "simple",
      regular_price: price || "10.00",
      description: (description || "") + extraText,
      images: images.map((src) => ({ src })),
    };

    const response = await wooApi.post("/products", product);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
