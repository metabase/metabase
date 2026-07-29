import type { Feature } from "geojson";
import L from "leaflet";

import { computeMinimalBoundsCoordinates } from "metabase/visualizations/lib/mapping";

// Builds an `L.LatLngBounds` from the leaflet-free bounds coordinates. Lives in
// its own (leaflet-importing) module so the only consumers are the lazily
// loaded leaflet map components.
export function computeMinimalBounds(features: Feature[]): L.LatLngBounds {
  const { southWest, northEast } = computeMinimalBoundsCoordinates(features);
  return L.latLngBounds(
    L.latLng(southWest.lat, southWest.lng),
    L.latLng(northEast.lat, northEast.lng),
  );
}
