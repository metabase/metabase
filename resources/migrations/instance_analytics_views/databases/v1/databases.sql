drop view if exists v_databases;

create or replace view v_databases as
select id                as entity_id,
       concat('database_', id) as entity_qualified_id,
       created_at,
       updated_at,
       name,
       description,
       engine            as database_type,
       metadata_sync_schedule,
       cache_field_values_schedule,
       timezone,
       is_on_demand,
       auto_run_queries,
       cache_ttl,
       creator_id,
       dbms_version      as db_version
from metabase_database
    where id <> 13371337;
