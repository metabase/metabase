DROP VIEW IF EXISTS v_view_log;


CREATE OR REPLACE VIEW v_view_log AS
  (SELECT id, timestamp, coalesce(user_id, 0) as user_id,
                         model AS entity_type,
                         model_id AS entity_id,
                         model || '_' || model_id AS entity_qualified_id,
                         embedding_client,
                         embedding_route,
                         CASE WHEN embedding_client LIKE '%-preview' THEN TRUE ELSE FALSE END AS is_preview,
                         has_access,
                         context,
                         embedding_sdk_version,
                         metabase_version,
                         auth_method,
                         tenant_id,
                         embedding_hostname,
                         embedding_path,
                         user_agent,
                         sanitized_user_agent,
                         ip_address
   FROM view_log)
