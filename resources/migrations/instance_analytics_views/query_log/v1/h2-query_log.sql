drop view if exists v_query_log;

create or replace view v_query_log as
select
    id as entity_id,
    started_at,
    cast(running_time as double) / 1000 as running_time_seconds,
    result_rows,
    native as is_native,
    context as query_source,
    error,
    executor_id as user_id,
    card_id,
    'card_' || card_id as card_qualified_id,
    dashboard_id,
    'dashboard_' || dashboard_id as dashboard_qualified_id,
    pulse_id,
    database_id,
    'database_' || database_id as database_qualified_id,
    cache_hit,
    action_id,
    'action_' || action_id as action_qualified_id
from query_execution;
