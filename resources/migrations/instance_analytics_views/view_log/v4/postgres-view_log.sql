DROP VIEW IF EXISTS v_view_log;


CREATE OR REPLACE VIEW v_view_log AS
  (SELECT id, timestamp, coalesce(user_id, 0) AS user_id,
                         model AS entity_type,
                         model_id AS entity_id,
                         model || '_' || model_id AS entity_qualified_id,
                         embedding_client,
                         CASE
                           WHEN embedding_client = 'embedding-sdk-react'         THEN 'sdk'
                           WHEN embedding_client = 'embedding-sdk-react-preview' THEN 'sdk-preview'
                           WHEN embedding_client = 'embedding-iframe'            THEN 'iframe'
                           WHEN embedding_client = 'embedding-iframe-preview'    THEN 'iframe-preview'
                           WHEN embedding_client = 'public'                      THEN 'public-link'
                           WHEN embedding_client = 'public-preview'              THEN 'public-link-preview'
                           WHEN embedding_client = 'guest-embed'                 THEN 'static-embed'
                           WHEN embedding_client = 'guest-embed-preview'         THEN 'static-embed-preview'
                           WHEN embedding_client = 'metabot'                     THEN 'metabot'
                           WHEN embedding_client = 'agent-api'                   THEN 'agent-api'
                           WHEN embedding_client IS NULL OR embedding_client = '' THEN 'internal'
                           ELSE embedding_client
                         END AS surface,
                         CASE WHEN embedding_client LIKE '%-preview' THEN TRUE ELSE FALSE END AS is_preview
   FROM view_log)
