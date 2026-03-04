
begin;

-- set uploads db schema name
update metabase_database md
set uploads_schema_name = (
	select mt.schema
	from metabase_database as md
	left join metabase_table mt
	on md.id = mt.db_id
	where md.engine = 'clickhouse' and md.uploads_enabled = true and md.uploads_schema_name is null and md.is_attached_dwh = true
	and mt.schema is not null
	order by mt.created_at desc
	limit 1
)
where md.engine = 'clickhouse' and md.uploads_enabled = true and md.uploads_schema_name is null and md.is_attached_dwh = true

-- retire synced tables
with uploads_db as (
	select id, uploads_schema_name
	from metabase_database md
	where md.engine = 'clickhouse' and md.uploads_enabled = true and md.uploads_schema_name is not null and md.is_attached_dwh = true
	limit 1
)
update metabase_table
set
active = false,
name = concat(name, '_retired_69667'),
is_defective_duplicate = true
where db_id = (select id from uploads_db) and
schema = (select uploads_schema_name from uploads_db) and
schema is not null and active = true and is_upload = false

-- revive upload tables
with uploads_db as (
	select id, uploads_schema_name
	from metabase_database md
	where md.engine = 'clickhouse' and md.uploads_enabled = true and md.uploads_schema_name is not null and md.is_attached_dwh = true
	limit 1
)
update metabase_table
set
active = true,
schema = (select uploads_schema_name from uploads_db)
where db_id = (select id from uploads_db) and
schema is null and active = false and is_upload = true

rollback;

commit;
