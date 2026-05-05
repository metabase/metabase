drop view if exists v_tasks;

CREATE OR REPLACE
SQL SECURITY INVOKER
VIEW v_tasks AS
select
    id,
    task,
    status,
    concat('database_', db_id) as database_qualified_id,
    started_at,
    ended_at,
    cast(duration as double) / 1000 as duration_seconds,
    task_details as details,
    run_id,
    logs
from task_history;
