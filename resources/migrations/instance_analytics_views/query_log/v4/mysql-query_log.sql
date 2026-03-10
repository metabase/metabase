DROP VIEW IF EXISTS v_query_log;


CREATE OR REPLACE
SQL SECURITY INVOKER
VIEW v_query_log AS
SELECT id AS entity_id,
       started_at,
       cast(running_time AS DOUBLE) / 1000 AS running_time_seconds,
       result_rows,
       native AS is_native,
       context AS query_source,
       error,
       coalesce(executor_id, 0) AS user_id,
       card_id,
       concat('card_', card_id) AS card_qualified_id,
       dashboard_id,
       concat('dashboard_', dashboard_id) AS dashboard_qualified_id,
       pulse_id,
       database_id,
       concat('database_', database_id) AS database_qualified_id,
       cache_hit,
       action_id,
       concat('action_', action_id) AS action_qualified_id,
       transform_id,
       concat('transform_', transform_id) AS transform_qualified_id,
       lens_id,
       lens_params,
       query
FROM query_execution
    LEFT JOIN query ON query_execution.hash = query.query_hash;
