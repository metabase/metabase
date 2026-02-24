DROP VIEW IF EXISTS v_pa_events;

CREATE OR REPLACE SQL SECURITY INVOKER VIEW v_pa_events AS
SELECT
  id,
  site_id,
  session_id,
  visit_id,
  event_type,
  event_name,
  url_path,
  url_query,
  referrer_path,
  referrer_query,
  referrer_domain,
  page_title,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_content,
  utm_term,
  gclid,
  fbclid,
  created_at
FROM product_analytics_event;
