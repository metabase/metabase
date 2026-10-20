-- Run after generate.ts has loaded pa_events and pa_identities.
-- A plain table, not a view: the data is static, and this avoids any doubt
-- about whether ClickHouse views sync into Metabase.
--
-- person_id is warehouse-side identity stitching:
--   coalesce(distinct_id, earliest distinct_id for this visitor_id, visitor_id)
-- plan, trial_source and amount are promoted out of event_data so the prototype does not
-- need map access in MBQL.
--
-- person_* columns are the person's traits as of the event, from the latest
-- identify() at or before it (pa_identity_history). An identify() in the same
-- second as an event applies to it, so checkout_completed carries the plan it
-- bought. Events before a person's first identify() have none. For their
-- current traits, use the FK to pa_identities_resolved instead.
--
-- person__identified is true from a person's first identify() on and false
-- before. The traits can't stand in for it, since an identify() may send none
-- of them. The double underscore keeps it apart from a trait called
-- "identified".

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
),
stitched AS (
    SELECT
        e.*,
        ifNull(coalesce(e.distinct_id, identity_map.mapped_distinct_id, e.visitor_id), '') AS person_id,
        e.event_data['plan'] AS plan,
        e.event_data['trial_source'] AS trial_source,
        toFloat64OrNull(e.event_data['amount']) AS amount
    FROM product_analytics.pa_events AS e
    LEFT JOIN identity_map ON identity_map.visitor_id = e.visitor_id
)
SELECT
    s.*,
    nullIf(h.identity_data['company'], '') AS person_company,
    nullIf(h.identity_data['role'], '') AS person_role,
    nullIf(h.identity_data['plan'], '') AS person_plan,
    nullIf(h.identity_data['billing_cycle'], '') AS person_billing_cycle,
    -- ASOF LEFT JOIN fills a missing match with defaults, not NULLs
    toBool(h.session_id != '') AS person__identified
FROM stitched AS s
ASOF LEFT JOIN product_analytics.pa_identity_history AS h
    ON h.website_id = s.website_id
   AND h.session_id = s.person_id
   AND s.created_at >= h.created_at;
