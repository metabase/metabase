/** How long the reporter batches page events before pushing them to the server. */
export const DIAGNOSTICS_FLUSH_MS = 100;

/** How long the reporter waits before re-attempting a failed push. */
export const DIAGNOSTICS_RETRY_MS = 1000;

/** How often feed readers re-read regardless of nudges. */
export const DIAGNOSTICS_POLL_MS = 2000;
