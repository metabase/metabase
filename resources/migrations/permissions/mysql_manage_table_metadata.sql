-- Insert DB-level permissions with a check for table-level permissions

INSERT INTO data_permissions (group_id, perm_type, db_id, schema_name, table_id, perm_value)
SELECT pg.id AS group_id,
       'perms/manage-table-metadata' AS perm_type,
       md.id AS db_id,
       NULL AS schema_name,
       NULL AS table_id,
       CASE
           WHEN EXISTS
                  (SELECT 1
                   FROM permissions p
                   WHERE p.group_id = pg.id
                     AND (p.object = concat('/data-model/db/', md.id, '/')
                          OR p.object = concat('/data-model/db/', md.id, '/schema/'))) THEN 'yes'
            ELSE 'no'
       END AS perm_value
FROM permissions_group pg
CROSS JOIN metabase_database md
WHERE pg.name != 'Administrators'
  AND NOT EXISTS
    (SELECT 1
     FROM data_permissions dp
     WHERE dp.group_id = pg.id
       AND dp.db_id = md.id
       AND dp.perm_type = 'perms/manage-table-metadata')
  AND CASE
          WHEN EXISTS
                 (SELECT 1
                  FROM permissions p
                  WHERE p.group_id = pg.id
                    AND (p.object = concat('/data-model/db/', md.id, '/')
                         OR p.object = concat('/data-model/db/', md.id, '/schema/'))) THEN TRUE
          WHEN NOT EXISTS
                 (SELECT 1
                  FROM permissions p
                  WHERE p.group_id = pg.id
                    AND p.object like concat('/data-model/db/', md.id, '/schema/%')) THEN TRUE
          ELSE FALSE
      END;

-- Insert table-level permissions only where no DB-level permissions exist
INSERT INTO data_permissions (group_id, perm_type, db_id, schema_name, table_id, perm_value)
WITH escaped_schema_table AS (
SELECT mt.id,
       mt.db_id,
       mt.schema,
       replace(replace(mt.schema, '\\', '\\\\'), '/', '\\/') AS escaped_schema
    FROM metabase_table mt
)
SELECT pg.id AS group_id,
       'perms/manage-table-metadata' AS perm_type,
       mt.db_id,
       mt.schema AS schema_name,
       mt.id AS table_id,
       CASE
           WHEN EXISTS
                  (SELECT 1
                   FROM permissions p
                   WHERE p.group_id = pg.id
                     AND (p.object = concat('/data-model/db/', mt.db_id, '/schema/', mt.escaped_schema, '/')
                          OR p.object = concat('/data-model/db/', mt.db_id, '/schema/', mt.escaped_schema, '/table/', mt.id, '/'))) THEN 'yes'
           ELSE 'no'
       END AS perm_value
FROM permissions_group pg
CROSS JOIN escaped_schema_table mt
WHERE pg.name != 'Administrators'
  AND NOT EXISTS
    (SELECT 1
     FROM data_permissions dp
     WHERE dp.group_id = pg.id
       AND dp.db_id = mt.db_id
       AND dp.table_id = mt.id
       AND dp.perm_type = 'perms/manage-table-metadata')
  AND NOT EXISTS
    (SELECT 1
     FROM data_permissions dp
     WHERE dp.group_id = pg.id
       AND dp.db_id = mt.db_id
       AND dp.table_id IS NULL
       AND dp.perm_type = 'perms/manage-table-metadata');
