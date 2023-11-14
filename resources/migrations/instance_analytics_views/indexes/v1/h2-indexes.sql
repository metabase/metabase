drop index if exists idx_view_log_timestamp;

create index if not exists idx_view_log_model_id
    on view_log(model_id);

create index if not exists idx_view_log_timestamp
    on view_log(timestamp);

create index if not exists idx_task_history_started_at
    on task_history(started_at);
