drop view if exists v_task_runs;

create or replace
SQL SECURITY INVOKER
view v_task_runs as
select
    id,
    run_type,
    entity_type,
    entity_id,
    case
        when entity_type = 'database' then concat('database_', entity_id)
        when entity_type = 'card' then concat('card_', entity_id)
        when entity_type = 'dashboard' then concat('dashboard_', entity_id)
        else concat(entity_type, '_', entity_id)
    end as entity_qualified_id,
    started_at,
    ended_at,
    case
        when ended_at is not null then
            cast(TIMESTAMPDIFF(SECOND, started_at, ended_at) as double)
        else null
    end as duration_seconds,
    status,
    process_uuid,
    updated_at
from task_run;
