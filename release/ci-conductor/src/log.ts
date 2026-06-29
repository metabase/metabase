/**
 * Progress line for the CI step log. The reporting step exists largely for
 * visibility, so it narrates what it's doing — but NEVER the webhook secret or
 * the base URL/host (metabase/metabase is a public repo). Only non-sensitive
 * identity fields and the request path are ever logged.
 */
export function log(message: string): void {
  console.log(`[ci-conductor] ${message}`);
}
