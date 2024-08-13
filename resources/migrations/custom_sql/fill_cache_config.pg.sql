WITH root AS (
  select 'root' AS model,
         0      AS model_id,
         'ttl'  AS strategy,
         json_build_object(
           'multiplier', coalesce((select CEILING(value::numeric(10,1))::integer from setting where key = 'query-caching-ttl-ratio'), 10),
           'min_duration_ms', coalesce((select CEILING(value::numeric(10,1))::integer from setting where key = 'query-caching-min-ttl'), 60000)
         ) AS config
), database AS (
  select 'database' AS model,
         id         AS model_id,
         'duration' AS strategy,
         json_build_object('duration', cache_ttl, 'unit', 'hours') AS config
    from metabase_database
   where cache_ttl is not null
), dashboard AS (
  select 'dashboard' AS model,
         id          AS model_id,
         'duration'  AS strategy,
         json_build_object('duration', cache_ttl, 'unit', 'hours') AS config
    from report_dashboard
   where cache_ttl is not null
), card AS (
  select 'question' AS model,
         id         AS model_id,
         'duration' AS strategy,
         json_build_object('duration', cache_ttl, 'unit', 'hours') AS config
    from report_card
   where cache_ttl is not null
), rows1 AS (
  SELECT * FROM root UNION ALL
  SELECT * FROM database UNION ALL
  SELECT * FROM dashboard UNION ALL
  SELECT * FROM card
), rows AS (
  SELECT * FROM rows1
   WHERE (SELECT true FROM setting WHERE key = 'enable-query-caching' AND VALUE = 'true')
)
    INSERT INTO cache_config (model, model_id, strategy, config)
    SELECT * FROM rows
    ON CONFLICT (model, model_id) DO NOTHING;
