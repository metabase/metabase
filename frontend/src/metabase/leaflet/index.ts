import "leaflet/dist/leaflet.css";

// The default import keeps leaflet's exports object live,
// so the draw members that loadDraw() attaches later show up on every imported `L`.
import L from "leaflet";

export { L };

let drawLoaded: Promise<void> | undefined;

// leaflet-draw has no exports of its own — importing it attaches the draw members to `L`.
export function loadDraw(): Promise<void> {
  drawLoaded ??= import("leaflet-draw").then(() => undefined);
  return drawLoaded;
}
