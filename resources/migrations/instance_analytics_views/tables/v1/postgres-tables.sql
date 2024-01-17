drop view if exists v_tables;

create or replace view v_tables as
select
    id as entity_id,
    'table_' || id as entity_qualified_id,
    created_at,
    updated_at,
    name,
    display_name,
    description,
    active,
    db_id as database_id,
    schema,
    is_upload
from metabase_table;
