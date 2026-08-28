/**
 * Refresh short-lived credentials one minute before their 5-minute lifetime ends.
 * The lifetime is hard-coded in `ui-credential-lifetime-seconds` on `mcp/session.clj`
 */
export const UI_CREDENTIAL_REFRESH_INTERVAL_MS = 4 * 60 * 1000;

/** Wait before retrying a failed credential refresh. */
export const UI_CREDENTIAL_REFRESH_RETRY_MS = 30 * 1000;

/** Show the authentication error after this many failed retry attempts. */
export const UI_CREDENTIAL_REFRESH_MAX_FAILURES = 2;

/** Server tool that issues a fresh scoped credential for any Metabase MCP App. */
export const UI_CREDENTIAL_REFRESH_TOOL = "refresh_ui_credential";
