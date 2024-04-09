DROP VIEW IF EXISTS v_audit_log;


CREATE OR REPLACE VIEW v_audit_log AS
  (SELECT id,
          CASE
              WHEN topic = 'card-create' THEN 'card-create'
              WHEN topic = 'card-delete' THEN 'card-delete'
              WHEN topic = 'card-update' THEN 'card-update'
              WHEN topic = 'pulse-create' THEN 'subscription-create'
              WHEN topic = 'pulse-delete' THEN 'subscription-delete'
              ELSE topic
          END AS topic, timestamp, NULL AS end_timestamp,
                                   coalesce(user_id, 0) AS user_id,
                                   lower(model) AS entity_type,
                                   model_id AS entity_id,
                                   CASE
                                       WHEN model = 'Dataset' THEN 'card_' || model_id
                                       WHEN model_id IS NULL THEN NULL
                                       ELSE lower(model) || '_' || model_id
                                   END AS entity_qualified_id, -- this definition must match the table functional index idx_audit_log_entity_qualified_id
 details
   FROM audit_log
   WHERE topic NOT IN ('card-read',
                       'card-query',
                       'dashboard-read',
                       'dashboard-query',
                       'table-read') );
