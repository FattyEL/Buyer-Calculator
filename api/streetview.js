// Street-level photo of an address for Mile High AI (Google Street View Static API).
// GET /api/streetview?address=...&size=480x360  → image/jpeg, or 404 when Google has no photo there.

export default async function handler(req, res) {
  const address = String(req.query.address || '').replace(/,\s*(USA|United States)$/i, '').trim();
  const size = /^\d{2,3}x\d{2,3}$/.test(String(req.query.size || '')) ? String(req.query.size) : '480x360';
  if (address.length < 8) return res.status(400).json({ error: 'Enter a complete address.' });

  const apiKey = String(process.env.GOOGLE_MAPS_API_KEY || '').replace(/[^\x21-\x7E]/g, '');
  if (!apiKey) return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY is not configured.' });

  try {
    // The metadata check is free and tells us whether a photo exists, so we never return Google's gray "no image" tile.
    const meta = await fetch(
      `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(address)}&source=outdoor&key=${apiKey}`,
    ).then((r) => r.json());
    if (meta.status !== 'OK') {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(404).json({ error: meta.error_message || `No street photo (${meta.status}).` });
    }
    const img = await fetch(
      `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${encodeURIComponent(address)}&fov=80&source=outdoor&return_error_code=true&key=${apiKey}`,
    );
    if (!img.ok) return res.status(404).json({ error: 'No street photo.' });
    const buf = Buffer.from(await img.arrayBuffer());
    res.setHeader('Content-Type', img.headers.get('content-type') || 'image/jpeg');
    // Same address, same photo: let browsers keep it for a week.
    res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=604800');
    return res.status(200).send(buf);
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'Street photo lookup failed.' });
  }
}
