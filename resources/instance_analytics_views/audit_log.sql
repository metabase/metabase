create or replace view v_audit_log as
(
select row_number() over (order by timestamp) as id, source.*
from (select case
                 when model = 'card' then 'question-view'
                 when model = 'table' then 'table-view'
                 when model = 'dashboard' then 'dashboard-view'
                 end  as topic,
             timestamp,
             null     as end_timestamp,
             user_id,
             model,
             case
                 when model = 'card' then concat('question_', cast(model_id as text))
                 when model = 'table' then concat('table_', cast(model_id as text))
                 when model = 'dashboard' then concat('dashboard_', cast(model_id as text))
                 else cast(model_id as text)
                 end  as model_id,
             metadata as details
      from view_log
      union
      select case
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
             model,
             case
                 when model = 'dataset' then concat('model_', cast(model_id as text))
                 when model = 'card' then concat('question_', cast(model_id as text))
                 when model = 'pulse' then concat('subscription_', cast(model_id as text))
                 else concat(model, '_', model_id)
                 end as model_id,
             details
      from activity) AS source
    )