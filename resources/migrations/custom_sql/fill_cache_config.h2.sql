WITH root AS (
  select 'root' AS model,
         0      AS model_id,
         'ttl'  AS strategy,
         json_object(
           'multiplier' VALUE coalesce((select ceil(("VALUE"::varchar(15))::float)::int from setting where "KEY" = 'query-caching-ttl-ratio'), 10),
           'min_duration_ms' VALUE coalesce((select ceil(("VALUE"::varchar(15))::float)::int from setting where "KEY" = 'query-caching-min-ttl'), 60000)
         ) AS config
), database AS (
  select 'database' AS model,
         id         AS model_id,
         'duration' AS strategy,
         json_object('duration' VALUE cache_ttl, 'unit' VALUE 'hours') AS config
    from metabase_database
   where cache_ttl is not null
), dashboard AS (
  select 'dashboard' AS model,
         id          AS model_id,
         'duration'  AS strategy,
         json_object('duration' VALUE cache_ttl, 'unit' VALUE 'hours') AS config
    from report_dashboard
   where cache_ttl is not null
), card AS (
  select 'question' AS model,
         id         AS model_id,
         'duration' AS strategy,
         json_object('duration' VALUE cache_ttl, 'unit' VALUE 'hours') AS config
    from report_card
   where cache_ttl is not null
), rows1 AS (
  SELECT * FROM root UNION ALL
  SELECT * FROM database UNION ALL
  SELECT * FROM dashboard UNION ALL
  SELECT * FROM card
), rows AS (
  SELECT * FROM rows1
   WHERE (SELECT true FROM setting WHERE "KEY" = 'enable-query-caching' AND "VALUE" = 'true')
)
    MERGE INTO cache_config AS C
    USING rows AS R (model, model_id, strategy, config)
    ON C.model = R.model AND C.model_id = R.model_id
    WHEN NOT MATCHED THEN
         INSERT (model, model_id, strategy, config)
         VALUES (R.model, R.model_id, R.strategy, R.config);
