DROP VIEW IF EXISTS "V_PA_SESSIONS";

CREATE OR REPLACE VIEW "V_PA_SESSIONS" AS
SELECT
  id           AS "ID",
  session_uuid AS "SESSION_UUID",
  site_id      AS "SITE_ID",
  distinct_id  AS "DISTINCT_ID",
  browser      AS "BROWSER",
  os           AS "OS",
  device       AS "DEVICE",
  screen       AS "SCREEN",
  language     AS "LANGUAGE",
  country      AS "COUNTRY",
  subdivision1 AS "SUBDIVISION1",
  city         AS "CITY",
  created_at   AS "CREATED_AT",
  updated_at   AS "UPDATED_AT"
FROM product_analytics_session;
