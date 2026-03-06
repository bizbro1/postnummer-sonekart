# Postnummer Sonekart

Interaktivt kartverktøy for å gruppere norske postnummerområder i soner og ruter.

## Filstruktur

```
Postnummer/
├── index.html                       # Hovedside med HTML-struktur
├── vite.config.js                   # Vite-konfigurasjon
├── package.json                     # Avhengigheter og scripts
├── scripts/
│   └── prepare-data.js              # Pre-prosesserer rå GeoJSON
├── src/
│   ├── main.js                      # Inngangspunkt – initialiserer alt
│   ├── constants.js                 # Fargepaletter, stiler, delte konstanter
│   ├── state.js                     # State-håndtering og localStorage
│   ├── groups.js                    # GroupManager-klasse for soner/ruter
│   ├── map.js                       # Leaflet-kart og GeoJSON-lasting
│   ├── draw.js                      # Tegneverktøy (sirkel, rektangel, lasso)
│   ├── radius.js                    # Radius-basert soneinndeling
│   ├── ui.js                        # UI-rendering og event-håndtering
│   ├── export.js                    # JSON/CSV eksport og import
│   ├── geo.js                       # Geometri-beregninger (Haversine, PiP)
│   └── styles.css                   # All styling
├── data/
│   ├── postnummeromrader.geojson            # Rå GeoJSON (ikke i git)
│   ├── postnummeromrader-prepared.geojson   # Pre-prosessert (ikke i git)
│   └── centroids.json                       # Senterpunkter (ikke i git)
└── README.md
```

## Kom i gang

### 1. Installer avhengigheter

```bash
npm install
```

### 2. Forbered GeoJSON-data

Last ned **Postnummerområder** fra [Geonorge](https://kartkatalog.geonorge.no/metadata/postnummeromraader/462a5297-33ef-438a-82a5-07fff5c0f76b) i GeoJSON-format. Legg filen i `data/postnummeromrader.geojson`.

Kjør deretter data-scriptet som reprojiserer, trimmer og optimaliserer filen:

```bash
npm run prepare-data
```

Dette reduserer filen fra ~100 MB til ~20 MB og pre-beregner senterpunkter.

### 3. Start utviklingsserver

```bash
npm run dev
```

Åpne **http://localhost:3000** i nettleseren.

### 4. Bygg for produksjon (valgfritt)

```bash
npm run build
```

Ferdig bygget legges i `dist/`.

---

## Funksjoner

### Kartvisning

- **Leaflet** med OpenStreetMap-baselayer
- Alle norske postnummerområder vises som polygoner
- Zoomer automatisk til Norge ved oppstart
- Tooltip med postnummer og poststed ved hover

### Soneadministrasjon (Sonekart-fanen)

- **Klikk polygon** for å toggle valgt/ikke valgt – tilhører aktiv sone
- **Dropdown** for å velge aktiv sone (Sone 1, Sone 2, ...)
- **+/−** knapper for å legge til eller fjerne soner
- Unik farge per sone

### Ruteadministrasjon (Ruter-fanen)

- Samme funksjonalitet som soner, men for ruter
- Mulighet for å gi ruter egne navn
- Separate eksport-filer

### Tegneverktøy

- **Sirkel** – tegn en sirkel for å velge alle postnumre inni
- **Rektangel** – tegn et rektangel for bulk-valg
- **Frihåndslasso** – hold museknappen nede og tegn fritt

### Radius-soneinndeling

Automatisk inndeling basert på luftlinjeavstand fra et sentrum-postnummer:

| Felt | Beskrivelse |
|---|---|
| **Sentrum postnr** | Postnummeret som er sentrum (f.eks. `1414`) |
| **Km per sone** | Avstand per sone-ring i km (standard 10) |
| **Antall soner** | Hvor mange soner som opprettes (standard 5) |
| **Samle resten i siste** | Postnummer utenfor siste ring → siste sone |

### Søk

Fritekst-søk på postnummer og poststed med debounce. Klikk et resultat for å zoome.

### Sonelister

Viser alle postnummer per sone/rute sortert. Klikk for å zoome, **×** for å fjerne.

---

## Eksport og import

### Eksporter JSON

```json
{
  "Sone 1": ["0001", "0010", "0015"],
  "Sone 2": ["2000", "2010"]
}
```

### Eksporter CSV

Semikolon-separert med UTF-8 BOM (for korrekt æøå i Excel):

```
Country;Postcode;Territory;City
Norway;1;Sone 1;OSLO
Norway;4098;Sone 3;TANANGER
```

### Importer JSON

Last inn en tidligere eksportert JSON-fil for å gjenopprette soner/ruter.

### Automatisk lagring

All tilstand lagres i `localStorage` ved hver endring og gjenopprettes ved neste besøk.

---

## Datakilde

Datasettet **Postnummerområder** eies av Kartverket/Bring.

**Nedlasting:** https://kartkatalog.geonorge.no/metadata/postnummeromraader/462a5297-33ef-438a-82a5-07fff5c0f76b

Velg GeoJSON-format. Filen er i EPSG:25833 (UTM sone 33N) – `prepare-data.js` reprojiserer til WGS84.

### GeoJSON-attributter

Appen gjenkjenner disse feltnavnene automatisk:

| Attributt | Varianter |
|---|---|
| Postnummer | `postnummer`, `POSTNUMMER`, `postnr`, `POSTNR`, `postal_code`, `postkode` |
| Poststed | `poststed`, `POSTSTED`, `poststedsnavn`, `POSTSTEDSNAVN`, `navn`, `NAVN` |

---

## Teknologi

| Komponent | Versjon / Kilde |
|---|---|
| Vite | Build-verktøy og dev-server |
| Leaflet | 1.9.4 (CDN) |
| proj4js | Brukes i `prepare-data.js` (npm) |
| OpenStreetMap | Tile layer |
| Lagring | localStorage |
