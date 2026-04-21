drop view if exists v_tables;

CREATE OR REPLACE
SQL SECURITY INVOKER
VIEW v_tables AS
select
    id as entity_id,
    concat('table_', id) as entity_qualified_id,
    created_at,
    updated_at,
    name,
    display_name,
    description,
    active,
    db_id as database_id,
    "schema",
    is_upload,
    entity_type,
    visibility_type,
    estimated_row_count,
    view_count,
    owner_email,
    owner_user_id
from metabase_table;
