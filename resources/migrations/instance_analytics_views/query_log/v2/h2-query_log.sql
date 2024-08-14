DROP VIEW IF EXISTS v_query_log;


CREATE OR REPLACE VIEW v_query_log AS
SELECT id AS entity_id,
       started_at,
       cast(running_time AS DOUBLE) / 1000 AS running_time_seconds,
       result_rows,
       native AS is_native,
       context AS query_source,
       error,
       coalesce(executor_id, 0) AS user_id,
       card_id,
       'card_' || card_id AS card_qualified_id,
       dashboard_id,
       'dashboard_' || dashboard_id AS dashboard_qualified_id,
       pulse_id,
       database_id,
       'database_' || database_id AS database_qualified_id,
       cache_hit,
       action_id,
       'action_' || action_id AS action_qualified_id,
       query
FROM query_execution
    LEFT JOIN query ON query_execution.hash = query.query_hash;
