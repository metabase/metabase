-- MySQL needs rollbacks for these indexes because it doesn't support `CREATE IF NOT EXISTS`.
-- Without rollbacks, downgrading and upgrading again will fail with an error about duplicated index names.
drop index idx_audit_log_entity_qualified_id on audit_log;
drop index idx_activity_entity_qualified_id on activity;
drop index idx_query_execution_card_qualified_id on query_execution;
drop index idx_user_full_name on core_user;
drop index idx_view_log_model_id on view_log;
-- Restore the incorrectly named index on model_id in rollback
drop index idx_view_log_timestamp on view_log;
create index idx_view_log_timestamp on view_log (model_id);
drop index idx_view_log_entity_qualified_id on view_log;
