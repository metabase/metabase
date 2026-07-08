/**
 * Route normalization for the coverage manifests.
 *
 * Capture (e2e/support/per-test-capture.js) records concrete request paths
 * ("GET /api/card/173/query"); the manifests want route shapes
 * ("GET /api/card/:id/query") so entries dedupe across runs and can later be
 * matched against backend endpoint definitions.
 */

const NUMERIC_SEGMENT = /^\d+$/;
const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// NanoID entity ids: 21 chars of [A-Za-z0-9_-]. Real API path segments are
// lowercase words, so requiring a digit or uppercase letter avoids swallowing
// a literal segment that happens to be 21 chars long.
const ENTITY_ID_SEGMENT = /^(?=.*[A-Z0-9])[A-Za-z0-9_-]{21}$/;

function normalizeSegment(segment) {
  if (NUMERIC_SEGMENT.test(segment)) {
    return ":id";
  }
  if (UUID_SEGMENT.test(segment)) {
    return ":uuid";
  }
  if (ENTITY_ID_SEGMENT.test(segment)) {
    return ":entity-id";
  }
  return segment;
}

// "GET /api/card/173/query" -> "GET /api/card/:id/query". Unparseable values
// pass through untouched rather than dropping data.
export function normalizeRoute(route) {
  const separator = route.indexOf(" ");
  if (separator === -1) {
    return route;
  }
  const method = route.slice(0, separator);
  const pathname = route.slice(separator + 1);
  return `${method} ${pathname.split("/").map(normalizeSegment).join("/")}`;
}

// Normalized, deduped, sorted.
export function normalizeRoutes(routes) {
  return [...new Set((routes || []).map(normalizeRoute))].sort();
}
