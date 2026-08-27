export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const { modelImage, garmentImage } = req.body || {};

  if (!modelImage || !garmentImage) {
    return res.status(400).json({ error: 'modelImage and garmentImage are both required' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(200).json({
      imageUrl: modelImage,
      placeholder: true,
      note: 'No GEMINI_API_KEY configured yet — returning the uploaded photo unchanged. Add GEMINI_API_KEY in Vercel project settings to enable real generation.',
    });
  }

  function splitDataUrl(dataUrl) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl);
    if (!match) return null;
    return { mimeType: match[1], data: match[2] };
  }

  const personImg = splitDataUrl(modelImage);
  const garmentImg = splitDataUrl(garmentImage);

  if (!personImg || !garmentImg) {
    return res.status(400).json({ error: 'modelImage and garmentImage must be data URLs (data:image/...;base64,...)' });
  }

  const prompt =
    'You are given two images: the FIRST is a photo of a person, the SECOND is a photo of a clothing garment. ' +
    'Generate a new photorealistic image showing the SAME person from the first image wearing the garment from ' +
    'the second image, replacing whatever they are currently wearing. Preserve the person\'s face, body shape, ' +
    'pose, and the background from the first image exactly. Make the garment fit naturally with realistic ' +
    'lighting, shadows, and fabric drape. Output only the final composited image.';

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: personImg.mimeType, data: personImg.data } },
                { inline_data: { mime_type: garmentImg.mimeType, data: garmentImg.data } },
              ],
            },
          ],
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      return res.status(geminiResponse.status).json({ error: 'Gemini API request failed', detail: errText });
    }

    const data = await geminiResponse.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inline_data || p.inlineData);
    const inline = imagePart?.inline_data || imagePart?.inlineData;

    if (!inline?.data) {
      return res.status(502).json({ error: 'Gemini did not return an image', raw: data });
    }

    const mimeType = inline.mime_type || inline.mimeType || 'image/png';
    const imageUrl = `data:${mimeType};base64,${inline.data}`;

    return res.status(200).json({ imageUrl, placeholder: false });
  } catch (err) {
    return res.status(500).json({ error: 'Server error calling Gemini', detail: String(err) });
  }
}
