export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const query = String(req.query.q || '').trim();
  if (query.length < 3) {
    return res.status(200).json({ suggestions: [] });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY is not configured.' });
  }

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text',
      },
      body: JSON.stringify({
        input: query,
        includedRegionCodes: ['us'],
      }),
    });

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      const message =
        data?.error?.message ||
        `Google address search failed (${response.status}).`;
      return res.status(response.status).json({ error: message });
    }

    const suggestions = (data.suggestions || [])
      .map(item => ({
        placeId: item?.placePrediction?.placeId || null,
        text: item?.placePrediction?.text?.text || '',
      }))
      .filter(item => item.text)
      .slice(0, 8);

    return res.status(200).json({ suggestions });
  } catch (error) {
    console.error(error);
    return res.status(502).json({
      error: error.message || 'Google address search failed.',
    });
  }
}
