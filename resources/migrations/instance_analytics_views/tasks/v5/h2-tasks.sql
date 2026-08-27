drop view if exists v_tasks;

create or replace view v_tasks as
select
    id,
    task,
    status,
    'database_' || db_id as database_qualified_id,
    started_at,
    ended_at,
    cast(duration as double) / 1000 as duration_seconds,
    task_details as details,
    run_id
from task_history;
