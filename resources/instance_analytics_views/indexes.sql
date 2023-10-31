drop index idx_view_log_timestamp;

create index idx_view_log_timestamp
    on view_log (timestamp desc);

create index idx_view_log_entity_qualified_id
    on view_log((model || '_' || model_id));
