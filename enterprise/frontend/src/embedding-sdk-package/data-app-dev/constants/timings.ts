/** How long the reporter batches page events before pushing them to the server. */
export const DIAGNOSTICS_FLUSH_MS = 100;

/** Poll interval when nothing can nudge the toolbar that the feed changed. */
export const DIAGNOSTICS_POLL_MS = 1000;

/**
 * Poll interval when the dev server *can* nudge: only a fallback for a nudge
 * that never arrived, so it stays rare.
 */
export const DIAGNOSTICS_HEARTBEAT_MS = 10_000;
