-- idx_view_log_timestamp was previously an index on model_id
drop index idx_view_log_timestamp on view_log;
create index if not exists idx_view_log_model_id
    on view_log (model_id);
create index if not exists idx_view_log_timestamp
    on view_log (timestamp);
