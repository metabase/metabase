-- MySQL needs rollbacks for these indexes because it doesn't support `CREATE IF NOT EXISTS`.
-- Without rollbacks, downgrading and upgrading again will fail with an error about duplicated index names.
drop index idx_audit_log_entity_qualified_id;
drop index idx_activity_entity_qualified_id;
drop index idx_query_execution_card_qualified_id;
drop index idx_user_full_name;
drop index idx_view_log_model_id;
-- Restore the incorrectly named index on model_id in rollback
drop index idx_view_log_timestamp;
create index idx_view_log_timestamp on view_log (model_id);
drop index idx_view_log_entity_qualified_id;
