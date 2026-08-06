export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!googleMapsApiKey) {
    return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY is not configured.' });
  }
  return res.status(200).json({ googleMapsApiKey });
}
