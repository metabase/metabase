------------------------------------------------------------------------------------
--- BEFORE UPDATE
------------------------------------------------------------------------------------

-- UPLOADS SCHEMA NAME FROM TABLES THAT WERE SYNCED WITH SCHEMA BEFORE UPDATE
-- This should only return 1 value (without the limit applied)
select mt.schema
from metabase_database as md
left join metabase_table mt
on md.id = mt.db_id
where md.engine = 'clickhouse' and md.uploads_enabled = true and md.uploads_schema_name is null -- and md.is_attached_dwh = true
and mt.schema is not null
order by mt.created_at desc
limit 1;

-- DATABASE TO BE UPDATED BEFORE UPDATE
-- This should only return 1 value
select count(*) over(), id, name, engine,
uploads_enabled, uploads_schema_name, uploads_table_prefix, is_attached_dwh
from metabase_database md
where md.engine = 'clickhouse' and md.uploads_enabled = true and md.uploads_schema_name is null -- and md.is_attached_dwh = true

-- ACTIVE TABLES TO RETIRE BEFORE UPDATE
with uploads_db as (
	select id, uploads_schema_name
	from metabase_database md
	where md.engine = 'clickhouse' and md.uploads_enabled = true and md.uploads_schema_name is null -- and md.is_attached_dwh = true
)
select id, name, active, db_id, display_name, schema, is_upload, *
from metabase_table
where db_id = (select id from uploads_db) and
schema = (
	select mt.schema
	from metabase_database as md
	left join metabase_table mt
	on md.id = mt.db_id
	where md.engine = 'clickhouse' and md.uploads_enabled = true and md.uploads_schema_name is null -- and md.is_attached_dwh = true
	and mt.schema is not null
	order by mt.created_at desc
	limit 1
)
and schema is not null and active = true and is_upload = false;

-- INACTIVE TABLES TO REVIVE BEFORE UPDATES
with uploads_db as (
	select id, uploads_schema_name
	from metabase_database md
	where md.engine = 'clickhouse' and md.uploads_enabled = true and md.uploads_schema_name is null -- and md.is_attached_dwh = true
	limit 1
)
select id, name, active, db_id, display_name, schema, is_upload, *
from metabase_table
where db_id = (select id from uploads_db) and
schema is null and active = false and is_upload = true

-- BEFORE UPDATE CHECKS
-- This should return empty results (ie a one-to-one mapping between tables to retire and tables to revive)
with uploads_db as (
	select id, uploads_schema_name
	from metabase_database md
	where md.engine = 'clickhouse' and md.uploads_enabled = true and md.uploads_schema_name is null -- and md.is_attached_dwh = true
),
active_table_names as (
	select db_id, name
	from metabase_table
	where db_id = (select id from uploads_db) and
	schema = (
		select mt.schema
		from metabase_database as md
		left join metabase_table mt
		on md.id = mt.db_id
		where md.engine = 'clickhouse' and md.uploads_enabled = true and md.uploads_schema_name is null -- and md.is_attached_dwh = true
		and mt.schema is not null
		order by mt.created_at desc
		limit 1
	)
	and schema is not null and active = true and is_upload = false
	order by name asc
),
inactive_table_names as (
	select db_id, name
	from metabase_table
	where db_id = (select id from uploads_db) and
	schema is null and active = false and is_upload = true
	order by name asc
)
(select * from active_table_names except select * from inactive_table_names)
union all
(select * from inactive_table_names except select * from active_table_names)

------------------------------------------------------------------------------------
--- AFTER UPDATE
------------------------------------------------------------------------------------

-- UPLOADS SCHEMA NAME VALUE AFTER UPDATE
-- This should return 1 value (without the limit applied)
select id, uploads_schema_name
from metabase_database md
where md.engine = 'clickhouse' and md.uploads_enabled = true and md.uploads_schema_name is not null -- and md.is_attached_dwh = true
limit 1;


-- ACTIVE TABLES TO RETIRE AFTER FIRST UPDATE
with uploads_db as (
	select id, uploads_schema_name
	from metabase_database md
	where md.engine = 'clickhouse' and md.uploads_enabled = true and md.uploads_schema_name is not null -- and md.is_attached_dwh = true
	limit 1
)
select id, name, active, db_id, display_name, schema, is_upload, *
from metabase_table
where db_id = (select id from uploads_db) and
schema = (select uploads_schema_name from uploads_db) and
schema is not null and active = true and is_upload = false

-- INACTIVE TABLES TO REVIVE AFTER FIRST UPDATE
with uploads_db as (
	select id, uploads_schema_name
	from metabase_database md
	where md.engine = 'clickhouse' and md.uploads_enabled = true and md.uploads_schema_name is not null -- and md.is_attached_dwh = true
	limit 1
)
select id, name, active, db_id, display_name, schema, is_upload, *
from metabase_table
where db_id = (select id from uploads_db) and
schema is null and active = false and is_upload = true

-- AFTER UPDATE CHECKS
-- This should return empty results (ie a one-to-one mapping between tables to retire and tables to revive)
with uploads_db as (
	select id, uploads_schema_name
	from metabase_database md
	where md.engine = 'clickhouse' and md.uploads_enabled = true and md.uploads_schema_name is not null -- and md.is_attached_dwh = true
	limit 1
),
active_table_names as (
	select db_id, name
	from metabase_table
	where db_id = (select id from uploads_db) and
	schema = (select uploads_schema_name from uploads_db) and
	schema is not null and active = true and is_upload = false
	order by name asc
),
inactive_table_names as (
	select db_id, name
	from metabase_table
	where db_id = (select id from uploads_db) and
	schema is null and active = false and is_upload = true
	order by name asc
)
(select * from active_table_names except select * from inactive_table_names)
union all
(select * from inactive_table_names except select * from active_table_names)
