drop view if exists v_tables;

create or replace view v_tables as
select
    t.id as entity_id,
    'table_' || t.id as entity_qualified_id,
    t.created_at,
    t.updated_at,
    t.name,
    coalesce(u.display_name, t.display_name) as display_name,
    case when u.description_set then u.description else t.description end as description,
    t.active,
    t.db_id as database_id,
    t.schema,
    t.is_upload,
    coalesce(u.entity_type, t.entity_type) as entity_type,
    case when u.visibility_type_set then u.visibility_type else t.visibility_type end as visibility_type,
    t.estimated_row_count,
    t.view_count,
    coalesce(u.owner_email, t.owner_email) as owner_email,
    coalesce(u.owner_user_id, t.owner_user_id) as owner_user_id
from metabase_table t
left join metabase_table_user_settings u on u.table_id = t.id;
