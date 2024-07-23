INSERT INTO data_permissions (group_id, perm_type, db_id, perm_value)
SELECT pg.id AS group_id,
       'perms/create-queries' AS perm_type,
       md.id AS db_id,
       CASE
           WHEN EXISTS
                  (SELECT 1
                   FROM data_permissions dp
                   WHERE dp.group_id = pg.id
                     AND dp.db_id = md.id
                     AND dp.table_id IS NULL
                     AND dp.perm_type = 'perms/native-query-editing'
                     AND dp.perm_value = 'yes' ) THEN 'query-builder-and-native'
           WHEN EXISTS
                  (SELECT 1
                   FROM data_permissions dp
                   WHERE dp.group_id = pg.id
                     AND dp.db_id = md.id
                     AND dp.table_id IS NULL
                     AND dp.perm_type = 'perms/data-access'
                     AND dp.perm_value = 'unrestricted' ) THEN 'query-builder'
           ELSE 'no'
       END AS perm_value
FROM permissions_group pg
CROSS JOIN metabase_database md
WHERE pg.name != 'Administrators'
  -- Insert DB-level rows for all DBs that have DB-level data access permissions,
  -- and don't already have any create-queries permissions stored at the DB-level
  AND EXISTS
    (SELECT 1
     FROM data_permissions dp
     WHERE dp.group_id = pg.id
       AND dp.db_id = md.id
       AND dp.table_id IS NULL
       AND dp.perm_type = 'perms/data-access' )
  AND NOT EXISTS
    (SELECT 1
     FROM data_permissions dp
     WHERE dp.group_id = pg.id
       AND dp.db_id = md.id
       AND dp.table_id IS NULL
       AND dp.perm_type = 'perms/create-queries' );

-- Insert table-level rows for all tables that have table-level data access permissions,
-- and don't already have any create-queries permissions stored at the DB- or table-level.
INSERT INTO data_permissions (group_id, perm_type, db_id, schema_name, table_id, perm_value)
SELECT
  dp.group_id,
  'perms/create-queries' AS perm_type,
  dp.db_id,
  dp.schema_name,
  dp.table_id,
  CASE
    WHEN dp.perm_value = 'unrestricted' THEN 'query-builder'
    ELSE 'no'
  END AS perm_value
FROM data_permissions dp
WHERE
  dp.perm_type = 'perms/data-access'
  AND dp.table_id IS NOT NULL
AND NOT EXISTS
  (SELECT 1
   FROM data_permissions dp2
   WHERE dp2.group_id = dp.group_id
     AND dp2.db_id = dp.db_id
     AND dp2.perm_type = 'perms/create-queries' );
