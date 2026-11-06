// Comparable properties for Mile High AI's "Find comps for me" (RentCast value estimate).
// GET /api/comps?address=...&propertyType=Condo&bedrooms=2&bathrooms=2&squareFootage=950

const PASS_THROUGH = ['propertyType', 'bedrooms', 'bathrooms', 'squareFootage', 'latitude', 'longitude'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const address = String(req.query.address || '').replace(/,\s*(USA|United States)$/i, '').trim();
  if (address.length < 8) return res.status(400).json({ error: 'Enter a complete property address.' });

  const apiKey = String(process.env.RENTCAST_API_KEY || '').replace(/[^\x21-\x7E]/g, '');
  if (!apiKey) return res.status(500).json({ error: 'RENTCAST_API_KEY is not configured.' });

  const q = new URLSearchParams({ address, compCount: '15' });
  for (const k of PASS_THROUGH) {
    const v = String(req.query[k] || '').trim();
    if (v) q.set(k, v);
  }

  try {
    const response = await fetch(`https://api.rentcast.io/v1/avm/value?${q}`, {
      headers: { Accept: 'application/json', 'X-Api-Key': apiKey },
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.message || `Comp search failed (${response.status}).` });
    }
    return res.status(200).json({
      estimate: data.price ?? null,
      rangeLow: data.priceRangeLow ?? null,
      rangeHigh: data.priceRangeHigh ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      comparables: Array.isArray(data.comparables) ? data.comparables : [],
    });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: error.message || 'Comp search failed.' });
  }
}
