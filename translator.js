\
const axios = require('axios');
const settings = require('./settings.json');

async function translateText(text, target='en'){
  if(!text || typeof text !== 'string' || text.trim().length===0) return '';
  try {
    const res = await axios.post(settings.libretranslate_url, {
      q: text,
      source: 'zh',
      target: target,
      format: 'text'
    }, { timeout: 20000 });
    if(res.data && res.data.translatedText) return res.data.translatedText;
    // some endpoints return {translatedText} or plain text
    return res.data.translatedText || (typeof res.data === 'string' ? res.data : '');
  } catch (e) {
    console.warn('Translate error', e.message);
    return '';
  }
}

module.exports = { translateText };
