\
const Tesseract = require('tesseract.js');
const axios = require('axios');

async function doOCRonImage(imageUrl){
  try {
    const resp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000 });
    const buffer = Buffer.from(resp.data, 'binary');
    const { createWorker } = Tesseract;
    const worker = createWorker();
    await worker.load();
    await worker.loadLanguage('chi_sim');
    await worker.initialize('chi_sim');
    const { data: { text } } = await worker.recognize(buffer);
    await worker.terminate();
    return text;
  } catch (e) {
    console.warn('OCR error', e.message);
    return '';
  }
}

module.exports = { doOCRonImage };
