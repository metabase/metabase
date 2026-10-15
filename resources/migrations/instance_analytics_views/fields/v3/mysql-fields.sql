drop view if exists v_fields;

create or replace
SQL SECURITY INVOKER
view v_fields as
select
    f.id as entity_id,
    concat('field_', f.id) as entity_qualified_id, -- should match idx_field_entity_qualified_id
    f.created_at,
    f.updated_at,
    f.name,
    coalesce(u.display_name, f.display_name) as display_name,
    case when u.description_set then u.description else f.description end as description,
    f.base_type,
    coalesce(u.visibility_type, f.visibility_type) as visibility_type,
    case when u.fk_target_field_id_set then u.fk_target_field_id else f.fk_target_field_id end as fk_target_field_id,
    coalesce(u.has_field_values, f.has_field_values) as has_field_values,
    f.active,
    f.table_id as table_id
from metabase_field f
left join metabase_field_user_settings u on u.field_id = f.id;
