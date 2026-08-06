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

function cleanAddress(raw) {
  return String(raw || '')
    .replace(/,\s*(USA|United States)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function withZipComma(address) {
  return address.replace(/,\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i, ', $1, $2');
}

function addressVariants(raw) {
  const cleaned = cleanAddress(raw);
  const variants = new Set([cleaned, withZipComma(cleaned)]);

  // Common unit variations used by property databases.
  const unitMatch = cleaned.match(
    /^(.*?)(?:,?\s+)(Apt|Apartment|Unit|#)\s*([A-Za-z0-9-]+),\s*(.+)$/i
  );

  if (unitMatch) {
    const street = unitMatch[1].trim();
    const unit = unitMatch[3].trim();
    const locality = unitMatch[4].trim();

    [
      `${street}, Apt ${unit}, ${locality}`,
      `${street} Apt ${unit}, ${locality}`,
      `${street}, Unit ${unit}, ${locality}`,
      `${street} Unit ${unit}, ${locality}`,
      `${street} #${unit}, ${locality}`,
      `${street}, #${unit}, ${locality}`,
      // Last fallback: building-level record. Returned fields remain editable.
      `${street}, ${locality}`,
    ].forEach(value => {
      variants.add(value);
      variants.add(withZipComma(value));
    });
  }

  return [...variants].filter(Boolean);
}

async function firstResult(endpoint, variants, apiKey, extra = '') {
  for (const address of variants) {
    const encoded = encodeURIComponent(address);
    const data = await rentcastGet(`${endpoint}?address=${encoded}${extra}`, apiKey);
    if (Array.isArray(data) && data.length) {
      return { result: data[0], matchedAddress: address };
    }
  }
  return { result: null, matchedAddress: null };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const address = String(req.query.address || '').trim();
  if (address.length < 8) {
    return res.status(400).json({ error: 'Enter a complete property address.' });
  }

  const apiKey = process.env.RENTCAST_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RENTCAST_API_KEY is not configured.' });
  }

  try {
    const variants = addressVariants(address);

    const [recordsResult, listingsResult] = await Promise.all([
      firstResult('/v1/properties', variants, apiKey, '&limit=1'),
      firstResult('/v1/listings/sale', variants, apiKey, '&status=Active&limit=1'),
    ]);

    const record = recordsResult.result;
    const listing = listingsResult.result;
    const source = listing || record;

    if (!source) {
      return res.status(200).json({
        found: false,
        property: null,
        attemptedAddresses: variants,
      });
    }

    const property = {
      formattedAddress: source.formattedAddress || record?.formattedAddress || cleanAddress(address),
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

    return res.status(200).json({
      found: true,
      property,
      matchedAddress: listingsResult.matchedAddress || recordsResult.matchedAddress,
      sources: {
        publicRecord: Boolean(record),
        activeListing: Boolean(listing),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(502).json({
      error: error.message || 'Property lookup failed.',
    });
  }
}
