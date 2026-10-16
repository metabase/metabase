-- Run after generate.ts has loaded pa_events.
-- A plain table, not a view: the data is static, and this avoids any doubt
-- about whether ClickHouse views sync into Metabase.
--
-- person_id is warehouse-side identity stitching:
--   coalesce(distinct_id, earliest distinct_id for this visitor_id, visitor_id)
-- plan and amount are promoted out of event_data so the prototype does not
-- need map access in MBQL.

DROP TABLE IF EXISTS product_analytics.pa_events_resolved;

CREATE TABLE product_analytics.pa_events_resolved
ENGINE = MergeTree()
ORDER BY (person_id, created_at)
AS
WITH identity_map AS (
    SELECT
        visitor_id,
        argMin(distinct_id, created_at) AS mapped_distinct_id
    FROM product_analytics.pa_events
    WHERE visitor_id IS NOT NULL
      AND distinct_id IS NOT NULL
    GROUP BY visitor_id
)
SELECT
    e.*,
    ifNull(coalesce(e.distinct_id, identity_map.mapped_distinct_id, e.visitor_id), '') AS person_id,
    e.event_data['plan'] AS plan,
    toFloat64OrNull(e.event_data['amount']) AS amount
FROM product_analytics.pa_events AS e
LEFT JOIN identity_map ON identity_map.visitor_id = e.visitor_id;
