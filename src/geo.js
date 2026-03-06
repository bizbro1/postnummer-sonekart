export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getCentroid(layer) {
  const c = layer.getBounds().getCenter();
  return { lat: c.lat, lng: c.lng };
}

export function pointInPolygon(point, polygon) {
  const [py, px] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [iy, ix] = polygon[i];
    const [jy, jx] = polygon[j];
    if (((iy > py) !== (jy > py)) &&
        (px < (jx - ix) * (py - iy) / (jy - iy) + ix)) {
      inside = !inside;
    }
  }
  return inside;
}
