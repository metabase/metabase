drop view v_worktree_field;
create view v_worktree_field as
select
    w.id as worktree_id,
    f.active,
    f.base_type,
    coalesce(u.caveats, case when bf.id is null then f.caveats else bf.caveats end) as caveats,
    case when u.effective_type is not null then u.coercion_strategy else case when bf.id is null then f.coercion_strategy else bf.coercion_strategy end end as coercion_strategy,
    f.created_at,
    coalesce(u.custom_position, case when bf.id is null then f.custom_position else bf.custom_position end) as custom_position,
    coalesce(u.data_sensitivity, case when bf.id is null then f.data_sensitivity else bf.data_sensitivity end) as data_sensitivity,
    f.database_default,
    f.database_indexed,
    f.database_is_auto_increment,
    f.database_is_generated,
    f.database_is_nullable,
    f.database_is_pk,
    f.database_partitioned,
    f.database_position,
    f.database_required,
    f.database_type,
    case when u.description_set then u.description else case when bf.id is null then f.description else bf.description end end as description,
    f.dimension_interestingness,
    coalesce(u.display_name, case when bf.id is null then f.display_name else bf.display_name end) as display_name,
    coalesce(u.effective_type, case when bf.id is null then f.effective_type else bf.effective_type end) as effective_type,
    f.fingerprint,
    f.fingerprint_version,
    case when u.fk_target_field_id_set then u.fk_target_field_id else case when bf.id is null then f.fk_target_field_id else bf.fk_target_field_id end end as fk_target_field_id,
    coalesce(u.has_field_values, case when bf.id is null then f.has_field_values else bf.has_field_values end) as has_field_values,
    coalesce(bf.id, f.id) as id,
    f.is_defective_duplicate,
    coalesce(u.json_unfolding, case when bf.id is null then f.json_unfolding else bf.json_unfolding end) as json_unfolding,
    f.last_analyzed,
    f.name,
    f.nfc_path,
    f.parent_id,
    coalesce(u.points_of_interest, case when bf.id is null then f.points_of_interest else bf.points_of_interest end) as points_of_interest,
    case when bf.id is null then f.position else bf.position end as position,
    case when bf.id is null then f.preview_display else bf.preview_display end as preview_display,
    case when u.semantic_type_set then u.semantic_type else case when bf.id is null then f.semantic_type else bf.semantic_type end end as semantic_type,
    coalesce(u.settings, case when bf.id is null then f.settings else bf.settings end) as settings,
    coalesce(ct.id, f.table_id) as table_id,
    f.unique_field_helper,
    f.updated_at,
    coalesce(u.visibility_type, case when bf.id is null then f.visibility_type else bf.visibility_type end) as visibility_type
from metabase_field f
cross join remote_sync_worktree w
join metabase_table t on t.id = f.table_id
left join table_remapping cc on cc.worktree_id = w.id and cc.database_id = t.db_id
    and cc.to_schema = coalesce(t.schema, '') and cc.to_table_name = t.name
left join metabase_table ct on cc.id is not null and ct.db_id = t.db_id
    and coalesce(ct.schema, '') = cc.from_schema and ct.name = cc.from_table_name
left join metabase_field bf on ct.id is not null and bf.table_id = ct.id and bf.name = f.name
    and bf.parent_id is null and f.parent_id is null
left join metabase_field_user_settings u on u.field_id = coalesce(bf.id, f.id) and u.worktree_id = w.id
where not exists (select 1 from table_remapping r
                  join metabase_table x on x.db_id = r.database_id
                      and coalesce(x.schema, '') = r.to_schema and x.name = r.to_table_name
                  where r.worktree_id = w.id and r.database_id = t.db_id
                    and r.from_schema = coalesce(t.schema, '') and r.from_table_name = t.name
                    and exists (select 1 from metabase_field xf where xf.table_id = x.id))
  and (cc.id is not null
       or not exists (select 1 from table_remapping r
                      where r.database_id = t.db_id and r.to_schema = coalesce(t.schema, '') and r.to_table_name = t.name));
