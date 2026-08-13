// Small shared utilities, kept out of the domain modules (identity / transport /
// adapters) so they don't reach across each other just to borrow a helper.

/** Parse a numeric env var, treating missing/blank/non-numeric as null. */
export function toNumber(value: string | undefined | null): number | null {
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Progress line for the CI step log. The reporting step exists largely for
 * visibility, so it narrates what it's doing — but NEVER the webhook secret or
 * the base URL/host (metabase/metabase is a public repo). Only non-sensitive
 * identity fields and the request path are ever logged.
 */
export function log(message: string): void {
  console.log(`[ci-conductor] ${message}`);
}
