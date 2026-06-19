// The backend won't return more than this many rows so in cases where we
// need to communicate or use that, use this constant. Must stay in sync with
// the backend default-(un)aggregated-query-row-limit in
// metabase.query-processor.middleware.constraints.
export const HARD_ROW_LIMIT = 50000;
