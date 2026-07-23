/**
 * Translate a react-router v7 route `path` into the equivalent v3 pattern.
 *
 * The route tree is authored in v7 syntax (the migration target). While the v3
 * engine is still live, the facade's `Route` builder runs each path through this
 * so v3 keeps matching exactly as before; the v7 engine uses the paths as-is.
 * Throwaway: deleted with the v3 engine in Phase 4, leaving a v7-native tree.
 *
 * It is a strict no-op for ordinary paths (no `?`, no `/*`), so only the handful
 * of routes using v7-only syntax are ever rewritten:
 *
 * - optional segment: `/:tabSlug?` -> `(/:tabSlug)`
 * - a param's splat tail: `:entity_id/*` -> `:entity_id(**)`
 * - a static splat tail: `files/*` -> `files(/**)`
 *
 * A bare `*` / `/*` catch-all is valid in both engines and is left untouched.
 */
export function translatePatternToV3(v7Pattern: string): string {
  return (
    v7Pattern
      // Optional dynamic segment.
      .replace(/\/(:[A-Za-z0-9_]+)\?/g, "(/$1)")
      // A param followed by a splat (entity-id links).
      .replace(/(:[A-Za-z0-9_]+)\/\*/g, "$1(**)")
      // A static segment followed by a trailing splat.
      .replace(/([A-Za-z0-9_]+)\/\*$/g, "$1(/**)")
  );
}
