drop view if exists v_fields;

create or replace view v_fields as
select
    id as entity_id,
    'field_' || id as entity_qualified_id,
    created_at,
    updated_at,
    name,
    display_name,
    description,
    base_type,
    visibility_type,
    fk_target_field_id,
    has_field_values,
    active,
    table_id as table_id
from metabase_field;
