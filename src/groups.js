import { ZONE_COLORS, ROUTE_COLORS } from "./constants.js";

export class GroupManager {
  constructor(defaultName, colors) {
    this.groups = { [defaultName]: [] };
    this.active = defaultName;
    this.lookup = {};  // postnr → group name
    this.colors = colors;
  }

  color(groupName) {
    const idx = Object.keys(this.groups).indexOf(groupName);
    return this.colors[((idx % this.colors.length) + this.colors.length) % this.colors.length];
  }

  activeColor() {
    return this.color(this.active);
  }

  add(postnr, groupName) {
    if (this.lookup[postnr]) this.remove(postnr);
    if (!this.groups[groupName]) this.groups[groupName] = [];
    this.groups[groupName].push(postnr);
    this.lookup[postnr] = groupName;
  }

  remove(postnr) {
    const g = this.lookup[postnr];
    if (g && this.groups[g]) {
      this.groups[g] = this.groups[g].filter((p) => p !== postnr);
    }
    delete this.lookup[postnr];
  }

  toggle(postnr) {
    if (this.lookup[postnr]) {
      this.remove(postnr);
    } else {
      this.add(postnr, this.active);
    }
  }

  addGroup() {
    let n = Object.keys(this.groups).length + 1;
    const prefix = this.colors === ZONE_COLORS ? "Sone " : "Rute ";
    let name = prefix + n;
    while (this.groups[name]) { n++; name = prefix + n; }
    this.groups[name] = [];
    this.active = name;
    return name;
  }

  removeGroup() {
    if (Object.keys(this.groups).length <= 1) return [];
    const removed = this.groups[this.active] || [];
    for (const pnr of removed) delete this.lookup[pnr];
    delete this.groups[this.active];
    this.active = Object.keys(this.groups)[0];
    return removed;
  }

  renameGroup(newName) {
    if (!newName || newName === this.active || this.groups[newName]) return false;
    this.groups[newName] = this.groups[this.active];
    delete this.groups[this.active];
    for (const pnr of this.groups[newName]) this.lookup[pnr] = newName;
    this.active = newName;
    return true;
  }

  resetGroups(names) {
    for (const pnr of Object.keys(this.lookup)) delete this.lookup[pnr];
    this.groups = {};
    for (const name of names) this.groups[name] = [];
    this.active = names[0] || "Sone 1";
  }

  clearAll() {
    const removed = Object.keys(this.lookup);
    for (const pnr of removed) delete this.lookup[pnr];
    for (const g of Object.keys(this.groups)) this.groups[g] = [];
    return removed;
  }

  totalSelected() {
    return Object.keys(this.lookup).length;
  }

  toJSON() {
    return { groups: this.groups, active: this.active };
  }

  loadJSON(data) {
    if (!data || !data.groups) return;
    this.groups = data.groups;
    this.lookup = {};
    for (const [name, list] of Object.entries(this.groups)) {
      for (const pnr of list) this.lookup[pnr] = name;
    }
    this.active = (data.active && this.groups[data.active])
      ? data.active
      : Object.keys(this.groups)[0];
  }

  importFromObject(obj) {
    const cleared = Object.keys(this.lookup);
    for (const pnr of cleared) delete this.lookup[pnr];
    this.groups = {};
    for (const [name, list] of Object.entries(obj)) {
      if (!Array.isArray(list)) continue;
      this.groups[name] = [];
      for (const pnr of list) this.add(String(pnr), name);
    }
    const prefix = this.colors === ZONE_COLORS ? "Sone 1" : "Rute 1";
    if (Object.keys(this.groups).length === 0) this.groups[prefix] = [];
    this.active = Object.keys(this.groups)[0];
    return cleared;
  }
}

export function createZoneManager() {
  return new GroupManager("Sone 1", ZONE_COLORS);
}

export function createRouteManager() {
  return new GroupManager("Rute 1", ROUTE_COLORS);
}
