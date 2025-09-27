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

// --- Scrape Example ---
app.post("/scrape", async (req, res) => {
  try {
    const { url, language } = req.body;
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    let title = $("title").text() || "Untitled";
    let images = [];
    $("img").each((_, img) => {
      images.push($(img).attr("src"));
    });

    // Translate title
    const translatedTitle = await translateText(title, language || "en");

    res.json({
      title: translatedTitle,
      images,
      source: url,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Add Product to WooCommerce ---
app.post("/import", async (req, res) => {
  try {
    const { name, images, description, price } = req.body;

    const product = {
      name,
      type: "simple",
      regular_price: price || "10.00",
      description: description || "",
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
