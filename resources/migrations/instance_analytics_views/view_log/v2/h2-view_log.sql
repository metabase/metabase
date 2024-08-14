DROP VIEW IF EXISTS v_view_log;


CREATE OR REPLACE VIEW v_view_log AS
  (SELECT id, timestamp, coalesce(user_id, 0) as user_id,
                         model AS entity_type,
                         model_id AS entity_id,
                         model || '_' || model_id AS entity_qualified_id
   FROM view_log)
