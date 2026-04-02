DROP VIEW IF EXISTS v_view_log;


CREATE OR REPLACE
SQL SECURITY INVOKER
VIEW v_view_log AS
  (SELECT id, timestamp, coalesce(user_id, 0) as user_id,
                         model AS entity_type,
                         model_id AS entity_id,
                         concat(model, '_', model_id) AS entity_qualified_id,
                         embedding_client,
                         CASE
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
                           WHEN embedding_client = 'metabot'                     THEN 'metabot'
                           WHEN embedding_client = 'agent-api'                   THEN 'agent-api'
                           WHEN embedding_client IS NULL OR embedding_client = '' THEN 'internal'
                           ELSE embedding_client
                         END AS surface,
                         CASE WHEN embedding_client LIKE '%-preview' THEN 1 ELSE 0 END AS is_preview,
                         has_access,
                         context,
                         embedding_version,
                         auth_method,
                         tenant_id,
                         embedding_hostname,
                         embedding_path,
                         user_agent,
                         ip_address
   FROM view_log)
