DROP VIEW IF EXISTS "V_PA_SITES";

CREATE OR REPLACE VIEW "V_PA_SITES" AS
SELECT
  id              AS "ID",
  uuid            AS "UUID",
  name            AS "NAME",
  allowed_domains AS "ALLOWED_DOMAINS",
  archived        AS "ARCHIVED",
  created_at      AS "CREATED_AT",
  updated_at      AS "UPDATED_AT"
FROM product_analytics_site;
