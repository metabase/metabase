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
       query,
       embedding_client,
       embedding_route,
       CASE
         WHEN COALESCE(embedding_route, embedding_client) = 'public'       THEN 'public-sharing'
         WHEN COALESCE(embedding_route, embedding_client) = 'guest-embed'  THEN 'guest-embedding'
         WHEN COALESCE(embedding_route, embedding_client) = 'metabot'      THEN 'metabot'
         WHEN COALESCE(embedding_route, embedding_client) = 'agent-api'    THEN 'agent-api'
         WHEN embedding_client = 'embedding-sdk-react'         THEN 'sdk'
         WHEN embedding_client = 'embedding-sdk-react-preview' THEN 'sdk-preview'
         WHEN embedding_client = 'embedding-iframe'            THEN 'iframe'
         WHEN embedding_client = 'embedding-iframe-preview'    THEN 'iframe-preview'
         WHEN embedding_client = 'public'                      THEN 'public-sharing'
         WHEN embedding_client = 'public-preview'              THEN 'public-sharing-preview'
         WHEN embedding_client = 'guest-embed'                 THEN 'guest-embedding'
         WHEN embedding_client = 'guest-embed-preview'         THEN 'guest-embedding-preview'
         WHEN embedding_client = 'embedding-simple'            THEN 'modular-embedding'
         WHEN embedding_client = 'embedding-simple-preview'    THEN 'modular-embedding-preview'
         WHEN embedding_client IS NULL OR embedding_client = '' THEN 'internal'
         ELSE embedding_client
       END AS surface,
       CASE WHEN embedding_client LIKE '%-preview' THEN 1 ELSE 0 END AS is_preview,
       embedding_version,
       auth_method,
       is_sandboxed,
       is_impersonated,
       is_db_routed,
       parameters,
       tenant_id,
       embedding_hostname,
       embedding_path,
       user_agent,
       ip_address
FROM query_execution
    LEFT JOIN query ON query_execution.hash = query.query_hash;
