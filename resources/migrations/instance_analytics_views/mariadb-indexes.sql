-- view_log
drop index idx_view_log_timestamp on view_log;
create index idx_view_log_timestamp
    on view_log (timestamp);