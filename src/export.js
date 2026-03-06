import { postnrMap } from "./constants.js";

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportJSON(groupObj, filename) {
  const blob = new Blob([JSON.stringify(groupObj, null, 2)], { type: "application/json" });
  downloadBlob(blob, filename);
}

export function exportCSV(groupObj, filename) {
  const BOM = "\uFEFF";
  let csv = BOM + "Country;Postcode;Territory;City\n";
  for (const [name, list] of Object.entries(groupObj)) {
    const sorted = [...list].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    for (const pnr of sorted) {
      const info = postnrMap.get(pnr);
      const city = info && info.poststed ? info.poststed : "";
      csv += "Norway;" + parseInt(pnr, 10) + ";" + name + ";" + city + "\n";
    }
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, filename);
}

export function importJSONFile(fileInput, manager, onDone) {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (typeof imported !== "object" || Array.isArray(imported)) {
        alert("Ugyldig JSON-format.");
        return;
      }
      manager.importFromObject(imported);
      onDone();
    } catch (err) {
      alert("Feil ved import: " + err.message);
    }
  };
  reader.readAsText(file);
  fileInput.value = "";
}
