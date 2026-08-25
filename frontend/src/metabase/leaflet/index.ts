import "leaflet/dist/leaflet.css";

// leaflet-draw attaches its members to leaflet's exports object at import time, so leaflet must execute first.
// The default import keeps that object live,
// while a namespace import would capture a copy without the draw members.
import L from "leaflet";

import "leaflet-draw";

export { L };
