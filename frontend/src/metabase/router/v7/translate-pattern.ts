/**
 * Translate a react-router v3 route `path` into the equivalent react-router v7
 * pattern, used by the tree mapper when the app runs on the v7 engine. Throwaway:
 * it is deleted with the v3 engine in Phase 4, once the route source is authored
 * in v7 syntax directly.
 *
 * It covers the v3-only path syntaxes that map onto a single v7 pattern:
 *
 * - optional param groups: `(/:tabSlug)` -> `/:tabSlug?`
 * - a param followed by an optional splat: `:entity_id(**)` -> `:entity_id/*`
 * - double-splat: `files/**` -> `files/*`
 * - an in-segment trailing splat: `metabot*` -> `metabot/*`
 *
 * Sequential optional groups that contain a *static* segment
 * (`database(/:databaseId)(/schema/:schemaName)`) have no single-pattern v7
 * equivalent (v7's optional segments are not v3's nested optional groups), so
 * those routes are authored as nested routes instead and never reach this
 * function. Anything that still looks v3-only after translation throws, so a
 * missed case fails loudly at mount rather than mis-routing.
 */
export function translatePattern(v3Pattern: string): string {
  if (patternNeedsNesting(v3Pattern)) {
    throw new Error(
      `Cannot translate v3 route path "${v3Pattern}" to a v7 pattern; ` +
        "author it as nested routes instead.",
    );
  }

  const translated = v3Pattern
    // A param's optional splat tail: `:entity_id(**)` -> `:entity_id/*`.
    .replace(/\(\*\*\)/g, "/*")
    // Any remaining double-splat (`files/**`) -> v7's single-splat.
    .replace(/\*\*/g, "*")
    // A splat glued to the end of a segment (`metabot*`) -> its own segment.
    .replace(/([^/*])\*/g, "$1/*")
    // Optional groups: make every segment inside the parens optional.
    .replace(/\(([^()]*)\)/g, (_match, inner: string) => optionalize(inner));

  assertFullyTranslated(v3Pattern, translated);
  return translated;
}

/**
 * Whether a v3 pattern must be authored as nested routes rather than translated
 * to a single v7 pattern: an optional group holding a static segment. v7's
 * optional segments (`:a?`, `static?`) match independently, so they cannot
 * express v3's "all-or-nothing, left-to-right" nested optional groups.
 */
export function patternNeedsNesting(v3Pattern: string): boolean {
  const groups = v3Pattern.match(/\(([^()]*)\)/g) ?? [];
  return groups.some((group) => {
    const inner = group.slice(1, -1);
    if (inner === "**") {
      return false;
    }
    return inner
      .split("/")
      .some((segment) => segment !== "" && !segment.startsWith(":"));
  });
}

function optionalize(inner: string): string {
  return inner
    .split("/")
    .map((segment) => (segment === "" ? segment : `${segment}?`))
    .join("/");
}

function assertFullyTranslated(v3Pattern: string, translated: string): void {
  if (/[()]|\*\*/.test(translated)) {
    throw new Error(
      `Cannot translate v3 route path "${v3Pattern}" to a v7 pattern` +
        (patternNeedsNesting(v3Pattern)
          ? "; author it as nested routes instead."
          : "."),
    );
  }
}
