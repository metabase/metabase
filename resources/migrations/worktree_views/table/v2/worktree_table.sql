drop view v_worktree_table;
create view v_worktree_table as
select
    w.id as worktree_id,
    b.active,
    b.archived_at,
    coalesce(u.caveats, b.caveats) as caveats,
    b.created_at,
    coalesce(u.data_authority, b.data_authority) as data_authority,
    case when u.data_layer_set then u.data_layer else b.data_layer end as data_layer,
    case when u.data_source_set then u.data_source else b.data_source end as data_source,
    b.database_require_filter,
    b.db_id,
    b.deactivated_at,
    case when u.description_set then u.description else b.description end as description,
    coalesce(u.display_name, b.display_name) as display_name,
    coalesce(u.entity_type, b.entity_type) as entity_type,
    b.estimated_row_count,
    coalesce(u.field_order, b.field_order) as field_order,
    b.id,
    b.initial_sync_status,
    b.is_defective_duplicate,
    b.is_upload,
    b.is_writable,
    coalesce(c.from_table_name, b.name) as name,
    coalesce(u.owner_email, b.owner_email) as owner_email,
    coalesce(u.owner_user_id, b.owner_user_id) as owner_user_id,
    coalesce(u.points_of_interest, b.points_of_interest) as points_of_interest,
    case when c.id is null then b.schema else nullif(c.from_schema, '') end as schema,
    coalesce(u.show_in_getting_started, b.show_in_getting_started) as show_in_getting_started,
    b.transform_target,
    b.unique_table_helper,
    b.updated_at,
    b.view_count,
    case when u.visibility_type_set then u.visibility_type else b.visibility_type end as visibility_type
from metabase_table b
cross join remote_sync_worktree w
left join metabase_table_user_settings u on u.table_id = b.id and u.worktree_id = w.id
left join table_remapping c on c.worktree_id = w.id
    and c.database_id = b.db_id and c.to_schema = coalesce(b.schema, '') and c.to_table_name = b.name
where (c.id is not null or not exists (select 1 from table_remapping r
                                       where r.database_id = b.db_id
                                         and r.to_schema = coalesce(b.schema, '')
                                         and r.to_table_name = b.name))
  and not exists (select 1 from table_remapping r
                  where r.worktree_id = w.id
                    and r.database_id = b.db_id
                    and r.from_schema = coalesce(b.schema, '')
                    and r.from_table_name = b.name);
