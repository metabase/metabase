drop view v_worktree_field;
create view v_worktree_field as
select
    w.id as worktree_id,
    b.active,
    b.base_type,
    coalesce(u.caveats, b.caveats) as caveats,
    case when u.effective_type is not null then u.coercion_strategy else b.coercion_strategy end as coercion_strategy,
    b.created_at,
    coalesce(u.custom_position, b.custom_position) as custom_position,
    coalesce(u.data_sensitivity, b.data_sensitivity) as data_sensitivity,
    b.database_default,
    b.database_indexed,
    b.database_is_auto_increment,
    b.database_is_generated,
    b.database_is_nullable,
    b.database_is_pk,
    b.database_partitioned,
    b.database_position,
    b.database_required,
    b.database_type,
    case when u.description_set then u.description else b.description end as description,
    b.dimension_interestingness,
    coalesce(u.display_name, b.display_name) as display_name,
    coalesce(u.effective_type, b.effective_type) as effective_type,
    b.fingerprint,
    b.fingerprint_version,
    case when u.fk_target_field_id_set then u.fk_target_field_id else b.fk_target_field_id end as fk_target_field_id,
    coalesce(u.has_field_values, b.has_field_values) as has_field_values,
    b.id,
    b.is_defective_duplicate,
    coalesce(u.json_unfolding, b.json_unfolding) as json_unfolding,
    b.last_analyzed,
    b.name,
    b.nfc_path,
    b.parent_id,
    coalesce(u.points_of_interest, b.points_of_interest) as points_of_interest,
    b.position,
    b.preview_display,
    case when u.semantic_type_set then u.semantic_type else b.semantic_type end as semantic_type,
    coalesce(u.settings, b.settings) as settings,
    b.table_id,
    b.unique_field_helper,
    b.updated_at,
    coalesce(u.visibility_type, b.visibility_type) as visibility_type
from metabase_field b
cross join remote_sync_worktree w
left join metabase_field_user_settings u on u.field_id = b.id and u.worktree_id = w.id
join metabase_table t on t.id = b.table_id
left join table_remapping c on c.worktree_id = w.id
    and c.database_id = t.db_id and c.to_schema = coalesce(t.schema, '') and c.to_table_name = t.name
where (c.id is not null or not exists (select 1 from table_remapping r
                                       where r.database_id = t.db_id
                                         and r.to_schema = coalesce(t.schema, '')
                                         and r.to_table_name = t.name))
  and not exists (select 1 from table_remapping r
                  where r.worktree_id = w.id
                    and r.database_id = t.db_id
                    and r.from_schema = coalesce(t.schema, '')
                    and r.from_table_name = t.name);
