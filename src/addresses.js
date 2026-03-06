const BASE_URL = "https://ws.geonorge.no/adresser/v1";
const cache = new Map();

export async function fetchAddresses(postnummer, limit = 50) {
  if (cache.has(postnummer)) return cache.get(postnummer);

  const url = `${BASE_URL}/sok?postnummer=${postnummer}&treffPerSide=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Feil ved henting av adresser");
  const data = await res.json();

  const addresses = (data.adresser || []).map((a) => ({
    text: a.adressetekstutenadressetilleggsnavn || a.adressetekst,
    full: a.adressetekst,
    street: a.adressenavn,
    number: a.nummer,
    letter: a.bokstav || "",
    poststed: a.poststed,
    postnummer: a.postnummer,
    kommune: a.kommunenavn,
    lat: a.representasjonspunkt?.lat,
    lng: a.representasjonspunkt?.lon,
  }));

  addresses.sort((a, b) => {
    const s = a.street.localeCompare(b.street, "nb");
    return s !== 0 ? s : (a.number - b.number || a.letter.localeCompare(b.letter));
  });

  cache.set(postnummer, addresses);
  return addresses;
}

export async function randomAddress(postnummer) {
  const list = await fetchAddresses(postnummer);
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * @param {string[]} postnumre - postal codes in the group
 * @param {number} totalCount - total number of addresses wanted
 * @param {function} onProgress - callback(done, total)
 */
export async function randomAddressesForGroup(postnumre, totalCount = 5, onProgress) {
  const sampleSize = Math.min(postnumre.length, totalCount);
  const shuffled = [...postnumre].sort(() => Math.random() - 0.5).slice(0, sampleSize);

  const CONCURRENCY = 6;
  const results = [];
  let done = 0;

  async function fetchOne(pnr) {
    try {
      const list = await fetchAddresses(pnr);
      if (list.length > 0) {
        results.push(list[Math.floor(Math.random() * list.length)]);
      }
    } catch (_) {}
    done++;
    if (onProgress) onProgress(done, shuffled.length);
  }

  for (let i = 0; i < shuffled.length; i += CONCURRENCY) {
    const batch = shuffled.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(fetchOne));
  }

  return results;
}

export async function searchAddress(query) {
  if (!query || query.length < 3) return [];
  const url = `${BASE_URL}/sok?sok=${encodeURIComponent(query)}&treffPerSide=20`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.adresser || []).map((a) => ({
    text: a.adressetekstutenadressetilleggsnavn || a.adressetekst,
    full: a.adressetekst,
    postnummer: a.postnummer,
    poststed: a.poststed,
    kommune: a.kommunenavn,
    lat: a.representasjonspunkt?.lat,
    lng: a.representasjonspunkt?.lon,
  }));
}
