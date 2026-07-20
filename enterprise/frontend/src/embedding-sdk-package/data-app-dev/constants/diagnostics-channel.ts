export const DATA_APP_DIAGNOSTICS_EVENT = "data-app:diagnostics";

// Server → page nudge. Carries no data: readers re-read the endpoint, so the
// toolbar and a shell agent never diverge on where the truth came from.
export const DATA_APP_DIAGNOSTICS_CHANGED_EVENT =
  "data-app:diagnostics-changed";

export const DATA_APP_DIAGNOSTICS_URL = "/__data-app/diagnostics";

export const START_EVENT_ID_PARAM = "startEventId";

export const DATA_APP_DIAGNOSTICS_LIMIT = 200;

// Requests outrun every other kind by orders of magnitude, so under one shared
// cap a polling app quietly evicts the very errors the requests are meant to
// explain. Capping them separately keeps the rest of the buffer out of reach.
export const DATA_APP_DIAGNOSTICS_CALL_LIMIT = 50;

// Per-field cap. Bounding the entry count alone bounds nothing: one
// `console.error("failed", rows)` can be an arbitrarily large string.
export const DATA_APP_DIAGNOSTIC_MAX_CHARS = 4000;
