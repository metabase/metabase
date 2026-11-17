/**
 * Refresh three minutes after issue: two minutes before the server-side expiry
 * and 90 seconds before the conservative client-side deadline below. Two
 * 10-second attempts plus the 30-second backoff fit comfortably in that window.
 * The lifetime is hard-coded in `ui-credential-lifetime-seconds` on `mcp/session.clj`
 */
export const UI_CREDENTIAL_REFRESH_INTERVAL_MS = 3 * 60 * 1000;

/** Wait before retrying a failed credential refresh. */
export const UI_CREDENTIAL_REFRESH_RETRY_MS = 30 * 1000;

/** Credential minting is local and should fail quickly enough to retry safely. */
export const UI_CREDENTIAL_REFRESH_TIMEOUT_MS = 10 * 1000;

/**
 * Treat a credential as expired 30 seconds before its server-side lifetime.
 * The buffer covers request latency because the response does not expose its
 * exact expiry timestamp.
 */
export const UI_CREDENTIAL_VALIDITY_MS = 4.5 * 60 * 1000;

/**
 * Initial authentication shows an error after this many failures. Background
 * refreshes keep the current credential and begin another retry cycle instead.
 */
export const UI_CREDENTIAL_REFRESH_MAX_FAILURES = 2;

/** Server tool that issues a fresh scoped credential for any Metabase MCP App. */
export const UI_CREDENTIAL_REFRESH_TOOL = "refresh_ui_credential";

/** Metadata key that stores UI credential for MCP Apps. */
export const MCP_APPS_METADATA_KEY = "com.metabase/mcp-apps";
