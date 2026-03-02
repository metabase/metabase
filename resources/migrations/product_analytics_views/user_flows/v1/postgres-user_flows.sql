DROP VIEW IF EXISTS "V_PA_USER_FLOWS";

CREATE OR REPLACE VIEW "V_PA_USER_FLOWS" AS
WITH ordered_events AS (
  SELECT
    session_id,
    url_path,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at) AS step_num
  FROM product_analytics_event
  WHERE event_type = 1
),
flows AS (
  SELECT
    oe.step_num,
    oe.session_id,
    oe.url_path                                                                   AS source_url,
    LEAD(oe.url_path) OVER (PARTITION BY oe.session_id ORDER BY oe.created_at)   AS target_url
  FROM ordered_events oe
)
SELECT
  source_url AS "SOURCE",
  target_url AS "TARGET",
  COUNT(*)   AS "VALUE"
FROM flows f
WHERE target_url IS NOT NULL
  AND source_url != target_url
  AND NOT EXISTS (
    SELECT 1 FROM ordered_events oe
    WHERE oe.session_id = f.session_id
      AND oe.url_path = f.target_url
      AND oe.step_num < f.step_num
  )
GROUP BY step_num, source_url, target_url;
