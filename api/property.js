function latestTaxTotal(propertyTaxes) {
  if (!propertyTaxes || typeof propertyTaxes !== 'object') return null;
  const years = Object.keys(propertyTaxes).sort((a, b) => Number(b) - Number(a));
  for (const year of years) {
    const total = Number(propertyTaxes[year]?.total);
    if (Number.isFinite(total) && total >= 0) return total;
  }
  return null;
}

async function rentcastGet(path, apiKey) {
  const response = await fetch(`https://api.rentcast.io${path}`, {
    headers: { Accept: 'application/json', 'X-Api-Key': apiKey },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RentCast request failed (${response.status}): ${text.slice(0, 200)}`);
  }
  return response.json();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const address = String(req.query.address || '').trim();
  if (address.length < 8) return res.status(400).json({ error: 'Enter a complete property address.' });
  const apiKey = process.env.RENTCAST_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'RENTCAST_API_KEY is not configured.' });

  try {
    const encoded = encodeURIComponent(address);
    const [recordsResult, listingsResult] = await Promise.allSettled([
      rentcastGet(`/v1/properties?address=${encoded}&limit=1`, apiKey),
      rentcastGet(`/v1/listings/sale?address=${encoded}&status=Active&limit=1`, apiKey),
    ]);
    const record = recordsResult.status === 'fulfilled' && Array.isArray(recordsResult.value) ? recordsResult.value[0] : null;
    const listing = listingsResult.status === 'fulfilled' && Array.isArray(listingsResult.value) ? listingsResult.value[0] : null;
    const source = listing || record;
    if (!source) return res.status(200).json({ found: false, property: null });

    const property = {
      formattedAddress: source.formattedAddress || record?.formattedAddress || address,
      bedrooms: listing?.bedrooms ?? record?.bedrooms ?? null,
      bathrooms: listing?.bathrooms ?? record?.bathrooms ?? null,
      squareFootage: listing?.squareFootage ?? record?.squareFootage ?? null,
      lotSize: listing?.lotSize ?? record?.lotSize ?? null,
      yearBuilt: listing?.yearBuilt ?? record?.yearBuilt ?? null,
      propertyType: listing?.propertyType ?? record?.propertyType ?? null,
      monthlyHoa: listing?.hoa?.fee ?? record?.hoa?.fee ?? null,
      annualTaxes: latestTaxTotal(record?.propertyTaxes),
      listPrice: listing?.price ?? null,
      status: listing?.status ?? null,
      daysOnMarket: listing?.daysOnMarket ?? null,
      garageSpaces: record?.features?.garageSpaces ?? null,
      heatingType: record?.features?.heatingType ?? null,
      coolingType: record?.features?.coolingType ?? null,
      latitude: source.latitude ?? null,
      longitude: source.longitude ?? null,
    };
    return res.status(200).json({ found: true, property, sources: { publicRecord: Boolean(record), activeListing: Boolean(listing) } });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: error.message || 'Property lookup failed.' });
  }
}
