drop index idx_view_log_timestamp;

create index idx_view_log_timestamp
    on view_log(timestamp)
