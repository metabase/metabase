DROP VIEW IF EXISTS v_pa_sessions;

CREATE OR REPLACE VIEW v_pa_sessions AS
SELECT
  id,
  session_uuid,
  site_id,
  browser,
  os,
  device,
  screen,
  language,
  country,
  subdivision1,
  city,
  created_at,
  updated_at
FROM product_analytics_session;
