-- Not in Track. Run before loading pa_identities.
--
-- pa_identities is a ReplacingMergeTree, so ClickHouse drops all but the
-- latest identify() per person, on insert (optimize_on_insert) and in
-- background merges. Person properties as of each event need every row, so
-- this materialized view copies each insert block into an append-only table
-- before anything is collapsed. It needs no loader change, so Track could add
-- it as is; it only captures identify() calls made after it exists.
--
-- Each row is the full trait map from created_at until the person's next
-- identify(): SCD type 2 without a valid_to column. ASOF JOIN finds the row
-- in effect at a given time without one.

CREATE TABLE IF NOT EXISTS product_analytics.pa_identity_history
(
    website_id    String,
    session_id    String,
    identity_data Map(String, String),
    ip            String,
    created_at    DateTime
)
ENGINE = MergeTree()
ORDER BY (website_id, session_id, created_at);

CREATE MATERIALIZED VIEW IF NOT EXISTS product_analytics.pa_identity_history_mv
TO product_analytics.pa_identity_history
AS
SELECT website_id, session_id, identity_data, ip, created_at
FROM product_analytics.pa_identities;
