create or replace view v_view_log as
(
SELECT
    id,
    timestamp,
    user_id,
    model as entity_type,
    model_id as entity_id,
    concat(model, '_', model_id) as entity_qualified_id,
    metadata as details
FROM view_log
)
