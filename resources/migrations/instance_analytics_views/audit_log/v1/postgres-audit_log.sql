drop view if exists v_audit_log;

create or replace view v_audit_log as
(
select
    id,
    case
           when topic = 'card-create' then 'card-create'
           when topic = 'card-delete' then 'card-delete'
           when topic = 'card-update' then 'card-update'
           when topic = 'pulse-create' then 'subscription-create'
           when topic = 'pulse-delete' then 'subscription-delete'
           else topic
           end as topic,
       timestamp,
       null    as end_timestamp,
       user_id,
       lower(model) as entity_type,
       model_id as entity_id,
       case
           when model = 'Dataset' then 'card_' || model_id
           when model_id is null then null
           else lower(model) || '_' || model_id
           end as entity_qualified_id, -- this definition must match the table functional index idx_audit_log_entity_qualified_id
       details
from audit_log
where topic not in ('card-read', 'card-query', 'dashboard-read', 'dashboard-query', 'table-read')
);
