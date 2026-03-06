# Postnummer Sonekart

Webapp for å velge og gruppere norske postnummerområder i soner på et interaktivt kart.

## Filstruktur

```
Postnummer/
├── index.html                       # Hovedside med HTML-struktur
├── styles.css                       # All styling (layout, panel, kart)
├── app.js                           # All applikasjonslogikk
├── serve.ps1                        # Lokal HTTP-server (PowerShell)
├── data/
│   └── postnummeromrader.geojson    # GeoJSON med postnummerpolygoner
└── README.md
```

## Kjøre applikasjonen

Appen laster GeoJSON via `fetch` og krever en HTTP-server (fungerer ikke via `file://`).

### PowerShell (ingen avhengigheter)

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```

### Python

```bash
python -m http.server 8000
```

### Node.js

```bash
npx serve .
```

Åpne deretter **http://localhost:8000** i nettleseren.

---

## Funksjoner

### Kartvisning

- **Leaflet** med OpenStreetMap-baselayer
- Alle norske postnummerområder vises som polygoner med tynn kantlinje og gjennomsiktig fyll
- Zoomer automatisk til Norge ved oppstart
- Tooltip med postnummer og poststed vises ved hover over polygon

### Soneadministrasjon

- **Klikk polygon** for å toggle valgt/ikke valgt — tilhører aktiv sone
- **Dropdown** for å velge aktiv sone (Sone 1, Sone 2, ...)
- **+/−** knapper for å legge til eller fjerne soner
- Hver sone har unik farge som vises på kartet og i panelet

### Radius-soneinndeling

Automatisk soneinndeling basert på avstand fra et sentrum-postnummer:

| Felt                       | Beskrivelse                                                    |
|----------------------------|----------------------------------------------------------------|
| **Sentrum postnr**         | Postnummeret som er sentrum (f.eks. `1414`)                    |
| **Km per sone**            | Avstand per sone-ring i km (standard 10)                       |
| **Antall soner**           | Hvor mange soner som opprettes (standard 5)                    |
| **Samle resten i siste**   | Postnummer utenfor siste ring havner i siste sone              |

Knappen **"Generer soner fra radius"** beregner luftlinjeavstand (Haversine) fra sentrum til hvert postnummerområdes senterpunkt og tildeler soner automatisk. Stiplede sirkler vises som forhåndsvisning på kartet.

### Søk

Fritekstfilter på postnummer og poststed. Klikk et resultat for å zoome til området på kartet.

### Sonelister

Viser alle postnummer per sone sortert, med poststedsnavn. Klikk postnummer for å zoome, klikk **×** for å fjerne fra sonen.

### Statuslinje

Viser totalt antall valgte postnummerområder samt antall per sone med fargekode.

---

## Eksport og import

### Eksporter JSON

Laster ned en JSON-fil med sonestruktur:

```json
{
  "Sone 1": ["0001", "0010", "0015"],
  "Sone 2": ["2000", "2010"]
}
```

### Eksporter CSV

Laster ned en semikolon-separert CSV-fil med UTF-8 BOM (for korrekt æøå i Excel):

```
Country;Postcode;Territory;City
Norway;1;Sone 1;OSLO
Norway;10;Sone 1;OSLO
Norway;4098;Sone 3;TANANGER
```

### Importer JSON

Last inn en tidligere eksportert JSON-fil for å gjenopprette soner.

### Automatisk lagring

All tilstand (soner, valg, aktiv sone) lagres automatisk i `localStorage` ved hver endring og gjenopprettes ved neste besøk.

---

## Datakilde

### Postnummerområder fra Geonorge

Datasettet **"Postnummerområder"** eies av Kartverket/Bring.

**Nedlasting:** https://kartkatalog.geonorge.no/metadata/postnummeromraader/462a5297-33ef-438a-82a5-07fff5c0f76b

Velg GeoJSON-format ved nedlasting. Filen er typisk i EPSG:25833 (UTM sone 33N) — appen reprojiserer automatisk til WGS84 ved lasting via **proj4js**.

### Nestet GeoJSON-struktur

Geonorge-filen wrapper FeatureCollection under nøkkelen `"postnummeromrader.postnummeromrade"`. Appen håndterer dette automatisk ved å søke etter FeatureCollection i toppnivå-nøklene.

### Konvertering fra andre formater

Hvis filen lastes ned i GML eller SOSI-format:

```bash
# GML -> GeoJSON
ogr2ogr -f GeoJSON -t_srs EPSG:4326 postnummeromrader.geojson input.gml

# SOSI -> GeoJSON (krever GDAL med FYBA-støtte)
ogr2ogr -f GeoJSON -t_srs EPSG:4326 postnummeromrader.geojson input.sos
```

### Redusere filstørrelse

Original fil kan være 50–100 MB. For raskere lasting:

```bash
ogr2ogr -f GeoJSON -t_srs EPSG:4326 -simplify 0.001 output.geojson input.geojson
```

---

## GeoJSON-attributter

Appen gjenkjenner disse feltnavnene automatisk:

| Attributt    | Varianter som sjekkes                                                           |
|--------------|---------------------------------------------------------------------------------|
| Postnummer   | `postnummer`, `POSTNUMMER`, `postnr`, `POSTNR`, `postal_code`, `postkode`       |
| Poststed     | `poststed`, `POSTSTED`, `poststedsnavn`, `POSTSTEDSNAVN`, `navn`, `NAVN`        |

Hvis datasettet bruker andre feltnavn, legg dem til i `POSTNR_KEYS` og `POSTSTED_KEYS` i `app.js`.

---

## Teknologi

| Komponent       | Versjon / Kilde                        |
|-----------------|----------------------------------------|
| Leaflet         | 1.9.4 (CDN)                           |
| proj4js         | 2.9.2 (CDN)                           |
| OpenStreetMap   | Tile layer                             |
| Lagring         | localStorage                           |
| Backend         | Ingen — ren statisk HTML/CSS/JS        |
