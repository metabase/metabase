DROP VIEW IF EXISTS "V_PA_SESSION_DATA";

CREATE OR REPLACE VIEW "V_PA_SESSION_DATA" AS
SELECT
  id           AS "ID",
  session_id   AS "SESSION_ID",
  data_key     AS "DATA_KEY",
  string_value AS "STRING_VALUE",
  number_value AS "NUMBER_VALUE",
  date_value   AS "DATE_VALUE",
  data_type    AS "DATA_TYPE",
  created_at   AS "CREATED_AT"
FROM product_analytics_session_data;
