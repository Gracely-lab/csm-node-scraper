\
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { translateText } = require('./translator');
const { doOCRonImage } = require('./ocr');
const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;

const settings = JSON.parse(fs.readFileSync(path.join(__dirname,'settings.json')));

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

const PORT = process.env.PORT || 10000;

// WooCommerce client (uses settings.json by default, recommend using env vars in prod)
const wc = new WooCommerceRestApi({
  url: process.env.WC_URL || settings.woocommerce.url,
  consumerKey: process.env.WC_KEY || settings.woocommerce.consumer_key,
  consumerSecret: process.env.WC_SECRET || settings.woocommerce.consumer_secret,
  version: 'wc/v3',
  queryStringAuth: true
});

app.get('/', (req, res) => res.send('CSM Taobao/1688 Scraper running'));

/**
 * /proxy?url=ENCODED_URL
 * Fetches remote page, injects Import buttons and translates some text.
 */
app.get('/proxy', async (req, res) => {
  try {
    const target = req.query.url;
    if (!target) return res.status(400).send('Missing url param');

    const resp = await axios.get(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 20000
    });
    let html = resp.data;
    const $ = cheerio.load(html);

    // Mark page as proxied
    $('head').append('<meta name="csm-proxy" content="true" />');

    // Simple injection: add Import buttons beside product links
    $('a').each(function(){
      const href = $(this).attr('href') || '';
      if (/detail\\.|offer\\//i.test(href) || /item\\.taobao/.test(href)){
        let resolved = href;
        try { resolved = new URL(href, target).href; } catch(e){}
        const btn = `<button class="csm-import-btn" style="margin-left:6px;padding:4px 6px;background:#ff6f00;color:#fff;border:none;border-radius:3px;cursor:pointer;" data-url="${resolved}">Import</button>`;
        $(this).after(btn);
      }
    });

    // Inject client-side script to post messages to parent (so WP iframe can handle clicks)
    $('body').append(`
      <script>
        (function(){
          document.addEventListener('click', function(e){
            var t = e.target;
            if(t && t.classList && t.classList.contains('csm-import-btn')){
              var url = t.getAttribute('data-url');
              // Send message to parent window
              window.parent.postMessage({ type: 'csm-import', url: url }, '*');
              e.preventDefault();
            }
          }, true);
        })();
      </script>
    `);

    res.set('Content-Type','text/html; charset=utf-8');
    res.send($.html({ decodeEntities: false }));
  } catch (err) {
    console.error('Proxy error', err.message);
    res.status(500).send('Proxy error: ' + err.message);
  }
});

/**
 * /scrape (POST)
 * Body: { url: "https://detail.1688.com/offer/123.html" }
 * Returns JSON with title, description, images[], translations, ocr.
 */
app.post('/scrape', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing product URL' });

  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 20000
    });
    const $ = cheerio.load(data);

    const title = $('meta[name="title"]').attr('content') || $('title').text() || $('h1').first().text() || '';
    const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || $('#desc').text() || $('body').text().slice(0,2000) || '';

    const images = [];
    $('img').each((i, el) => {
      let src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original');
      if (src && !src.startsWith('data:')) {
        try { src = new URL(src, url).href; } catch(e){}
        images.push(src);
      }
    });
    const uniqImgs = Array.from(new Set(images)).slice(0, 30);

    // Translate title/description
    const title_en = await translateText(title, 'en');
    const description_en = await translateText(description, 'en');

    // OCR images (first 5)
    const ocr = [];
    for (let i=0;i<Math.min(5, uniqImgs.length);i++){
      try {
        const txt = await doOCRonImage(uniqImgs[i]);
        if (txt && txt.trim().length>0){
          const t = await translateText(txt, 'en');
          ocr.push({ image: uniqImgs[i], text: txt, translate: t });
        }
      } catch(e){
        console.warn('OCR failed', e.message);
      }
    }

    res.json({
      title,
      title_en,
      description,
      description_en,
      images: uniqImgs,
      ocr,
      source: url
    });
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    res.status(500).json({ error: 'Scraping failed', details: (err && err.message) || String(err) });
  }
});

/**
 * /import (POST)
 * Body: { product: {...}, autoFulfill: boolean (optional) }
 * Imports product into configured WooCommerce store via REST API.
 */
app.post('/import', async (req, res) => {
  const payload = req.body || {};
  const product = payload.product;
  if (!product || (!product.title && !product.title_en)) return res.status(400).json({ error: 'Missing product data' });

  try {
    const wcProduct = {
      name: product.title_en || product.title,
      type: 'simple',
      regular_price: product.price ? String(product.price) : undefined,
      description: product.description_en || product.description || '',
      images: (product.images || []).map(u => ({ src: u }))
    };

    const response = await wc.post('products', wcProduct);
    res.json({ success: true, product: response.data });
  } catch (err) {
    console.error('Import error', err.response && err.response.data ? err.response.data : err.message);
    res.status(500).json({ error: 'Import failed', details: err.message });
  }
});

app.listen(PORT, () => console.log('CSM scraper listening on port', PORT));
