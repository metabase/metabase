/**
 * Implements `structuredClone` in browsers that don't support it.
 *
 * TODO: remove this when Cypress and Jest support native `structuredClone`.
 */
export function clone<T>(value: T): T {
  // Unjustified type cast. FIXME
  return JSON.parse(JSON.stringify(value)) as T;
}
