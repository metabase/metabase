-- Insert DB-level permissions with a check for table-level permissions

INSERT INTO data_permissions (group_id, perm_type, db_id, SCHEMA_NAME, table_id, perm_value)
SELECT pg.id AS group_id,
       'manage-table-metadata' AS perm_type,
       md.id AS db_id,
       NULL AS SCHEMA_NAME,
       NULL AS table_id,
       CASE
           WHEN EXISTS
                  (SELECT 1
                   FROM permissions p
                   WHERE p.group_id = pg.id
                     AND (p.object = concat('/data-model/db/', md.id, '/')
                          OR p.object = concat('/data-model/db/', md.id, '/schema/'))) THEN 'yes'
           WHEN NOT EXISTS
                  (SELECT 1
                   FROM permissions p
                   WHERE p.group_id = pg.id
                     AND (p.object like concat('/data-model/db/', md.id, '/schema/%'))) THEN 'no'
       END AS perm_value
FROM permissions_group pg
CROSS JOIN metabase_database md
WHERE pg.name != 'Administrators'
  AND NOT EXISTS
    (SELECT 1
     FROM data_permissions dp
     WHERE dp.group_id = pg.id
       AND dp.db_id = md.id
       AND dp.perm_type = 'manage-table-metadata')
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
WITH escaped_schema_table AS (
SELECT id,
       db_id,
       SCHEMA,
       replace(replace(SCHEMA, '\', '\\'), '/', '\/') AS escaped_schema
    FROM metabase_table
)
INSERT INTO data_permissions (group_id, perm_type, db_id, schema_name, table_id, perm_value)
SELECT pg.id AS group_id,
       'MANAGE-TABLE-metadata' AS perm_type,
       mt.db_id,
       mt.schema AS schema_name,
       mt.id AS table_id,
       CASE
           WHEN EXISTS
                  (SELECT 1
                   FROM permissions p
                   WHERE p.group_id = pg.id
                     AND p.object = concat('/DATA-model/db/', mt.db_id, '/SCHEMA/', mt.escaped_schema, '/TABLE', mt.id, '/'))) THEN 'yes'
           ELSE 'NO'
       END AS perm_value
FROM permissions_group pg
CROSS JOIN escaped_schema_table mt
WHERE pg.name != 'administrators'
  AND NOT EXISTS
    (SELECT 1
     FROM data_permissions dp
     WHERE dp.group_id = pg.id
       AND dp.db_id = mt.db_id
       AND dp.table_id = mt.id
       AND dp.perm_type = 'MANAGE-TABLE-metadata')
  AND NOT EXISTS
    (SELECT 1
     FROM data_permissions dp
     WHERE dp.group_id = pg.id
       AND dp.db_id = mt.db_id
       AND dp.table_id IS NULL
       AND dp.perm_type = 'MANAGE-TABLE-metadata');
