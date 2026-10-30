-- Copied from pa-lambdas sql/pa_identities.sql, which mirrors the live Track
-- ClickHouse table (ReplacingMergeTree, no PARTITION BY). Keep this identical
-- so a swap to real Track data stays possible.
--
-- Track provisions session_mode "client", so for an identify() call
-- session_id is the id passed to identify(), the same value pa_events stores
-- in distinct_id. It is not a browsing session. Each identify() replaces the
-- whole identity_data map, and ReplacingMergeTree(created_at) keeps the latest.
CREATE TABLE IF NOT EXISTS product_analytics.pa_identities
(
    website_id    String,
    session_id    String,
    identity_data Map(String, String),
    ip            String,
    created_at    DateTime
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (website_id, session_id)
SETTINGS index_granularity = 8192;
