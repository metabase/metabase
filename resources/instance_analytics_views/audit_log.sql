drop view if exists v_audit_log;

create or replace view v_audit_log as
(
select
    id,
    case
           when topic = 'card-create' then 'question-create'
           when topic = 'card-delete' then 'question-delete'
           when topic = 'card-update' then 'question-update'
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
           when model = 'Dataset' then concat('card_', cast(model_id as text))
           when model = 'Card' then concat('card_', cast(model_id as text))
           when model = 'Pulse' then concat('subscription_', cast(model_id as text))
           when model_id is null then null
           else concat(lower(model), '_', model_id)
           end as entity_qualified_id,
       details
from audit_log
where topic not in ('card-read', 'card-query', 'dashboard-read', 'dashboard-query')
)
