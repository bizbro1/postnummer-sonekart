const BASE_URL = "https://ws.geonorge.no/adresser/v1";
const cache = new Map();

export async function fetchAddresses(postnummer, limit = 1000) {
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

export async function randomAddressesForGroup(postnumre, countPerPostnr = 1) {
  const results = [];
  const shuffled = [...postnumre].sort(() => Math.random() - 0.5);

  for (const pnr of shuffled) {
    try {
      const list = await fetchAddresses(pnr);
      if (list.length === 0) continue;
      const picked = new Set();
      const n = Math.min(countPerPostnr, list.length);
      while (picked.size < n) {
        picked.add(list[Math.floor(Math.random() * list.length)]);
      }
      results.push(...picked);
    } catch (_) {}
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
