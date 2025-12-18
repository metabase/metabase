MERGE INTO cache_config c
USING (
  WITH root AS (
    SELECT
      'root' AS model,
      0 AS model_id,
      'ttl' AS strategy,
      JSON_OBJECT(
        'multiplier' VALUE COALESCE((SELECT CEIL(CASE
          WHEN ("VALUE"::VARCHAR(21))::DECIMAL(20, 1) >= 2147483648 THEN 2147483647.0
          ELSE ("VALUE"::VARCHAR(21))::DECIMAL(20, 1)
        END)::INT FROM setting WHERE "KEY" = 'query-caching-ttl-ratio'), 10),
        'min_duration_ms' VALUE COALESCE((SELECT CEIL(CASE
          WHEN ("VALUE"::VARCHAR(21))::DECIMAL(20, 1) >= 2147483648 THEN 2147483647.0
          ELSE ("VALUE"::VARCHAR(21))::DECIMAL(20, 1)
        END)::INT FROM setting WHERE "KEY" = 'query-caching-min-ttl'), 60000)
      ) AS config
  ),
  database AS (
    SELECT 'database' AS model, id AS model_id, 'duration' AS strategy,
           JSON_OBJECT('duration' VALUE cache_ttl, 'unit' VALUE 'hours') AS config
    FROM metabase_database
    WHERE cache_ttl IS NOT NULL
  ),
  dashboard AS (
    SELECT 'dashboard' AS model, id AS model_id, 'duration' AS strategy,
           JSON_OBJECT('duration' VALUE cache_ttl, 'unit' VALUE 'hours') AS config
    FROM report_dashboard
    WHERE cache_ttl IS NOT NULL
  ),
  card AS (
    SELECT 'question' AS model, id AS model_id, 'duration' AS strategy,
           JSON_OBJECT('duration' VALUE cache_ttl, 'unit' VALUE 'hours') AS config
    FROM report_card
    WHERE cache_ttl IS NOT NULL
  ),
  rows AS (
    SELECT * FROM root UNION ALL
    SELECT * FROM database UNION ALL
    SELECT * FROM dashboard UNION ALL
    SELECT * FROM card
  )
  SELECT * FROM rows
  WHERE (SELECT true FROM setting WHERE "KEY" = 'enable-query-caching' AND "VALUE" = 'true')
) AS src
ON c.model = src.model AND c.model_id = src.model_id
WHEN NOT MATCHED THEN INSERT (model, model_id, strategy, config)
  VALUES (src.model, src.model_id, src.strategy, src.config);
