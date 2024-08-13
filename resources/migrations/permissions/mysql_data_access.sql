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
                     AND p.object LIKE concat('/db/', md.id, '/schema/%') ) THEN 'no-self-service'
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

-- Insert unrestricted rows into data_permissions for any table and group combinations that have data permission paths in `permissions`
INSERT INTO data_permissions (group_id, perm_type, db_id, schema_name, table_id, perm_value)
WITH escaped_schema_table AS (
    SELECT
        mt.id AS table_id,
        mt.db_id,
        mt.schema,
        CONCAT('/db/', mt.db_id, '/schema/', REPLACE(REPLACE(mt.schema, '\\', '\\\\'), '/', '\\/'), '/') AS schema_path,
        CONCAT('/db/', mt.db_id, '/schema/', REPLACE(REPLACE(mt.schema, '\\', '\\\\'), '/', '\\/'), '/table/', mt.id, '/') AS table_path,
        CONCAT('/db/', mt.db_id, '/schema/', REPLACE(REPLACE(mt.schema, '\\', '\\\\'), '/', '\\/'), '/table/', mt.id, '/query/') AS query_path,
        CONCAT('/db/', mt.db_id, '/schema/', REPLACE(REPLACE(mt.schema, '\\', '\\\\'), '/', '\\/'), '/table/', mt.id, '/query/segmented/') AS segmented_query_path
    FROM metabase_table mt
)
SELECT
    p.group_id,
    'perms/data-access' AS perm_type,
    est.db_id,
    est.schema AS schema_name,
    est.table_id,
    'unrestricted' AS perm_value
FROM escaped_schema_table est
JOIN permissions p
ON p.object IN (
    est.schema_path,
    est.table_path,
    est.query_path,
    est.segmented_query_path
)
WHERE NOT EXISTS (
    SELECT 1
    FROM data_permissions dp
    WHERE dp.group_id = p.group_id
      AND dp.db_id = est.db_id
      AND dp.table_id = est.table_id
      AND dp.perm_type = 'perms/data-access'
);

ANALYZE TABLE data_permissions;

-- Insert no-self-service rows into data_permissions for any table and group combinations that weren't inserted by the previous query
INSERT INTO data_permissions (group_id, perm_type, db_id, schema_name, table_id, perm_value)
SELECT
    pg.id AS group_id,
    'perms/data-access' AS perm_type,
    mt.db_id,
    mt.schema AS schema_name,
    mt.id AS table_id,
    'no-self-service' AS perm_value
FROM permissions_group pg
CROSS JOIN metabase_table mt
WHERE NOT EXISTS (
    SELECT 1
    FROM data_permissions dp
    WHERE dp.group_id = pg.id
      AND dp.db_id = mt.db_id
      AND (dp.table_id = mt.id
           OR dp.table_id IS NULL)
      AND dp.perm_type = 'perms/data-access'
)
AND pg.name != 'Administrators';
