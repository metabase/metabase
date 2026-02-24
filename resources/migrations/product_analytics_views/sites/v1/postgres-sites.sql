DROP VIEW IF EXISTS v_pa_sites;

CREATE OR REPLACE VIEW v_pa_sites AS
SELECT
  id,
  uuid,
  name,
  allowed_domains,
  archived,
  created_at,
  updated_at
FROM product_analytics_site;
