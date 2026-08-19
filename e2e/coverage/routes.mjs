/**
 * Route and page normalization for the coverage manifests.
 *
 * Capture (e2e/support/per-test-capture.js) records every concrete request
 * ("GET /api/card/173/query", "GET /app/assets/vendor-abc.js", third-party
 * URLs with origin kept) and every document navigation ("/dashboard/1-orders").
 * The manifests want shapes so entries dedupe across runs and can be matched
 * against backend endpoint definitions — filtering and normalization policy
 * lives here, offline, so it can change without re-running a nightly.
 *
 * Stored shapes are regex-normalized (":id"/":uuid"/":entity-id"/":token")
 * and deliberately independent of the OpenAPI route table. Matching against
 * endpoint definitions happens at consumption time: the manifest is built
 * from last night's SHA while a consumer compares against its own checkout's
 * endpoints, so baking one table's spelling in would break on any route
 * whose shape changed in between. A consumer matches structurally with
 * matchRoute() below against whichever spec version fits its checkout
 * (resources/openapi/openapi.json, generated from the backend's defendpoint
 * definitions by `bun run generate-openapi`; the nightly also ships its
 * freshly generated copy alongside the manifests).
 *
 * The nightly build still loads the table for one thing: logging captured
 * API routes that correspond to no endpoint definition — an endpoint defined
 * outside defendpoint, or a capture bug.
 */

import fs from "node:fs";

// Numeric ids, with or without a slug tail: "173", "1-orders-dashboard".
const NUMERIC_SEGMENT = /^\d+(-[^/]*)?$/;
const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// NanoID entity ids: 21 chars of [A-Za-z0-9_-]. Real API path segments are
// lowercase words, so requiring a digit or uppercase letter avoids swallowing
// a literal segment that happens to be 21 chars long.
const ENTITY_ID_SEGMENT = /^(?=.*[A-Z0-9])[A-Za-z0-9_-]{21}$/;
// Signed embedding tokens in /embed/* page paths: header.payload.signature.
const JWT_SEGMENT = /^[\w-]+\.[\w-]+\.[\w-]+$/;

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

// Matches a pathname against the table the way a router would: literal
// segments must match exactly, "{param}" segments match anything, and the
// candidate with the most literal matches wins ("/api/card/pivot" beats
// "/api/card/{id}" for POST /api/card/pivot). Ties break lexicographically
// for determinism. Returns the matched shape or null. Works for concrete
// paths ("/api/card/173") and for stored manifest shapes ("/api/card/:id") —
// a ":param" segment simply matches the table's "{param}" wildcard.
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
  if (JWT_SEGMENT.test(segment)) {
    return ":token";
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

// Capture records everything; the manifests' `routes` dimension is only
// internal backend API traffic. Internal requests are bare paths (third-party
// ones keep their origin), so "starts with /api/" selects exactly those.
export function apiRoutes(routes) {
  return (routes || []).filter((route) => {
    const separator = route.indexOf(" ");
    return separator !== -1 && route.slice(separator + 1).startsWith("/api/");
  });
}

// Document navigation paths -> deduped FE route shapes
// ("/dashboard/1-orders" -> "/dashboard/:id").
export function normalizePages(pages) {
  return [
    ...new Set(
      (pages || []).map((page) =>
        page.split("/").map(normalizeSegment).join("/"),
      ),
    ),
  ].sort();
}
