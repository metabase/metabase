DROP VIEW IF EXISTS "V_PA_EVENTS";

CREATE OR REPLACE VIEW "V_PA_EVENTS" AS
SELECT
  id              AS "ID",
  site_id         AS "SITE_ID",
  session_id      AS "SESSION_ID",
  visit_id        AS "VISIT_ID",
  event_type      AS "EVENT_TYPE",
  event_name      AS "EVENT_NAME",
  url_path        AS "URL_PATH",
  url_query       AS "URL_QUERY",
  referrer_path   AS "REFERRER_PATH",
  referrer_query  AS "REFERRER_QUERY",
  referrer_domain AS "REFERRER_DOMAIN",
  page_title      AS "PAGE_TITLE",
  utm_source      AS "UTM_SOURCE",
  utm_medium      AS "UTM_MEDIUM",
  utm_campaign    AS "UTM_CAMPAIGN",
  utm_content     AS "UTM_CONTENT",
  utm_term        AS "UTM_TERM",
  gclid           AS "GCLID",
  fbclid          AS "FBCLID",
  created_at      AS "CREATED_AT"
FROM product_analytics_event;
