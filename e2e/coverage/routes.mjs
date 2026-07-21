/**
 * Route normalization for the coverage manifests.
 *
 * Capture (e2e/support/per-test-capture.js) records concrete request paths
 * ("GET /api/card/173/query"); the manifests want route shapes so entries
 * dedupe across runs and can be matched against backend endpoint definitions.
 *
 * The authoritative shapes come from resources/openapi/openapi.json, which is
 * generated from the backend's defendpoint definitions (bun run
 * generate-openapi). Matching a captured path against that table yields the
 * backend's own spelling ("GET /api/card/{id}/query"), so selection later is
 * exact string comparison. Paths the table doesn't know (endpoints defined
 * outside defendpoint, or capture noise) fall back to regex normalization
 * (":id"/":uuid"/":entity-id") — those can't match a backend definition
 * anyway, so the fallback only needs to keep them deduplicating stably. The
 * two param spellings ("{id}" vs ":id") intentionally differ so table-matched
 * and fallback routes are distinguishable in the manifest.
 */

import fs from "node:fs";

const NUMERIC_SEGMENT = /^\d+$/;
const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// NanoID entity ids: 21 chars of [A-Za-z0-9_-]. Real API path segments are
// lowercase words, so requiring a digit or uppercase letter avoids swallowing
// a literal segment that happens to be 21 chars long.
const ENTITY_ID_SEGMENT = /^(?=.*[A-Z0-9])[A-Za-z0-9_-]{21}$/;

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);

const PARAM_SEGMENT = /^\{.+\}$/;

function splitPath(pathname) {
  return pathname.replace(/\/+$/, "").split("/");
}

/**
 * Builds a route matcher from a parsed OpenAPI spec. Returns null when the
 * spec has no usable paths.
 */
export function buildRouteTable(spec) {
  if (!spec?.paths || typeof spec.paths !== "object") {
    return null;
  }

  // Indexed by "METHOD segment-count" — only routes with the same method and
  // arity can match a captured path.
  const index = new Map();
  for (const [path, operations] of Object.entries(spec.paths)) {
    const segments = splitPath(path);
    for (const method of Object.keys(operations)) {
      if (!HTTP_METHODS.has(method)) {
        continue;
      }
      const key = `${method.toUpperCase()} ${segments.length}`;
      let candidates = index.get(key);
      if (!candidates) {
        index.set(key, (candidates = []));
      }
      candidates.push({ shape: path, segments });
    }
  }
  return index.size > 0 ? index : null;
}

/**
 * Loads the route table from an OpenAPI spec file. Returns null when the file
 * is missing or unparseable, in which case normalization is pure regex
 * fallback.
 */
export function loadRouteTable(openapiFile) {
  try {
    return buildRouteTable(JSON.parse(fs.readFileSync(openapiFile, "utf8")));
  } catch {
    return null;
  }
}

// Matches a concrete pathname against the table the way a router would:
// literal segments must match exactly, "{param}" segments match anything, and
// the candidate with the most literal matches wins ("/api/card/pivot" beats
// "/api/card/{id}" for POST /api/card/pivot). Ties break lexicographically
// for determinism. Returns the matched shape or null.
export function matchRoute(table, method, pathname) {
  const segments = splitPath(pathname);
  const candidates =
    table.get(`${String(method).toUpperCase()} ${segments.length}`) || [];

  let best = null;
  let bestLiterals = -1;
  for (const candidate of candidates) {
    let literals = 0;
    let matched = true;
    for (let i = 0; i < segments.length; i += 1) {
      if (candidate.segments[i] === segments[i]) {
        literals += 1;
      } else if (!PARAM_SEGMENT.test(candidate.segments[i])) {
        matched = false;
        break;
      }
    }
    if (
      matched &&
      (literals > bestLiterals ||
        (literals === bestLiterals && candidate.shape < best.shape))
    ) {
      best = candidate;
      bestLiterals = literals;
    }
  }
  return best ? best.shape : null;
}

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

// "GET /api/card/173/query" -> "GET /api/card/{id}/query" when the route
// table knows the path, "GET /api/card/:id/query" otherwise. Unparseable
// values pass through untouched rather than dropping data.
export function normalizeRoute(route, table) {
  const separator = route.indexOf(" ");
  if (separator === -1) {
    return route;
  }
  const method = route.slice(0, separator);
  const pathname = route.slice(separator + 1);
  if (table) {
    const shape = matchRoute(table, method, pathname);
    if (shape) {
      return `${method} ${shape}`;
    }
  }
  return `${method} ${pathname.split("/").map(normalizeSegment).join("/")}`;
}

// Normalized, deduped, sorted.
export function normalizeRoutes(routes, table) {
  return [
    ...new Set((routes || []).map((route) => normalizeRoute(route, table))),
  ].sort();
}
