DROP VIEW IF EXISTS v_pa_event_data;

CREATE OR REPLACE VIEW v_pa_event_data AS
SELECT
  id,
  event_id,
  data_key,
  string_value,
  number_value,
  date_value,
  data_type,
  created_at
FROM product_analytics_event_data;
