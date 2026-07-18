/**
 * Canonical text matchers, consolidated from the per-module copies that each
 * re-implemented the same escaped-regex substring matcher (column-compare,
 * click-behavior `caseSensitive`, filters-repros, filters `containsText`,
 * wave7-filters-admin, pie-chart).
 */

/** Escape a string for literal use inside a RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-sensitive substring matcher (Cypress `cy.contains` / `:contains`
 * semantics): a RegExp that matches the literal `text` anywhere in a string.
 */
export function caseSensitiveSubstring(text: string): RegExp {
  return new RegExp(escapeRegExp(text));
}
