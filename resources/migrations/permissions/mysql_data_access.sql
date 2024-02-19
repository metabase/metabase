-- Insert DB-level permissions for cases where no table-level perms are set

INSERT INTO data_permissions (group_id, perm_type, db_id, schema_name, table_id, perm_value)
SELECT pg.id AS group_id,
       'perms/data-access' AS perm_type,
       md.id AS db_id,
       NULL AS schema_name,
       NULL AS table_id,
       CASE
           WHEN EXISTS
                  (SELECT 1
                   FROM permissions p
                   WHERE p.group_id = pg.id
                     AND (p.object = concat('/db/', md.id, '/')
                          OR p.object = concat('/db/', md.id, '/schema/'))) THEN 'unrestricted'
           WHEN EXISTS
                  (SELECT 1
                   FROM permissions p
                   WHERE p.group_id = pg.id
                     AND p.object = concat('/block/db/', md.id, '/') ) THEN 'block'
           WHEN NOT EXISTS
                  (SELECT 1
                   FROM permissions p
                   WHERE p.group_id = pg.id
                     AND p.object LIKE concat('/db/', md.id, '/%') ) THEN 'no-self-service'
       END AS perm_value
FROM permissions_group pg
CROSS JOIN metabase_database md
WHERE pg.name != 'Administrators'
  AND NOT EXISTS
    (SELECT 1
     FROM data_permissions dp
     WHERE dp.group_id = pg.id
       AND dp.db_id = md.id
       AND dp.perm_type = 'perms/data-access' )
  AND CASE
          WHEN EXISTS
                 (SELECT 1
                  FROM permissions p
                  WHERE p.group_id = pg.id
                    AND (p.object = concat('/db/', md.id, '/')
                         OR p.object = concat('/db/', md.id, '/schema/')) ) THEN TRUE
          WHEN EXISTS
                 (SELECT 1
                  FROM permissions p
                  WHERE p.group_id = pg.id
                    AND p.object = concat('/block/db/', md.id, '/') ) THEN TRUE
          WHEN NOT EXISTS
                 (SELECT 1
                  FROM permissions p
                  WHERE p.group_id = pg.id
                    AND p.object LIKE concat('/db/', md.id, '/schema/%') ) THEN TRUE
          ELSE FALSE
      END;

-- Insert table-level permissions only where no DB-level permissions exist

INSERT INTO data_permissions (group_id, perm_type, db_id, schema_name, table_id, perm_value)
WITH escaped_schema_table AS (
    SELECT
    mt.id,
    mt.db_id,
    mt.schema,
    REPLACE(REPLACE(mt.schema, '\\', '\\\\'), '/', '\\/') AS escaped_schema
    FROM metabase_table mt
)
SELECT pg.id AS group_id,
       'perms/data-access' AS perm_type,
       mt.db_id,
       mt.schema AS schema_name,
       mt.id AS table_id,
       CASE
           WHEN EXISTS
                  (SELECT 1
                   FROM permissions p
                   WHERE p.group_id = pg.id
                     AND (p.object = concat('/db/', mt.db_id, '/schema/', mt.escaped_schema, '/')
                          OR p.object = concat('/db/', mt.db_id, '/schema/', mt.escaped_schema, '/table/', mt.id, '/')
                          OR p.object = concat('/db/', mt.db_id, '/schema/', mt.escaped_schema, '/table/', mt.id, '/query/')
                          OR p.object = concat('/db/', mt.db_id, '/schema/', mt.escaped_schema, '/table/', mt.id, '/query/segmented/')) ) THEN 'unrestricted'
           ELSE 'no-self-service'
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
       AND dp.perm_type = 'perms/data-access' )
  AND NOT EXISTS
    (SELECT 1
     FROM data_permissions dp
     WHERE dp.group_id = pg.id
       AND dp.db_id = mt.db_id
       AND dp.table_id IS NULL
       AND dp.perm_type = 'perms/data-access' );
