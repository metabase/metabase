DELETE
FROM data_permissions
WHERE perm_type = 'perms/data-access';

-- Insert DB-level block rows on rollback for any group that has sandboxes defined and
-- no 'create-queries' perms.
INSERT INTO data_permissions (group_id, perm_type, db_id, perm_value)
SELECT DISTINCT pg.id AS group_id,
                'perms/data-access' AS perm_type,
                mt.db_id,
                'block' AS perm_value
FROM permissions_group pg
CROSS JOIN metabase_table mt
WHERE EXISTS
    (SELECT 1
     FROM data_permissions dp
     JOIN sandboxes s ON s.table_id = dp.table_id
     WHERE dp.group_id = pg.id
       AND dp.table_id = mt.id
       AND dp.perm_type = 'perms/create-queries'
       AND dp.perm_value = 'no'
       AND s.table_id IS NOT NULL )
  AND pg.name != 'Administrators'
  AND NOT EXISTS
    (SELECT 1
     FROM data_permissions dp
     WHERE dp.group_id = pg.id
       AND dp.db_id = mt.db_id
       AND dp.perm_type = 'perms/data-access' );


INSERT INTO data_permissions (group_id, perm_type, db_id, perm_value)
SELECT pg.id AS group_id,
       'perms/data-access' AS perm_type,
       md.id AS db_id,
       CASE
           WHEN EXISTS
                  (SELECT 1
                   FROM data_permissions dp
                   WHERE dp.group_id = pg.id
                     AND dp.db_id = md.id
                     AND dp.table_id IS NULL
                     AND dp.perm_type = 'perms/view-data'
                     AND dp.perm_value = 'unrestricted' )
                AND EXISTS
                  (SELECT 1
                   FROM data_permissions dp
                   WHERE dp.group_id = pg.id
                     AND dp.db_id = md.id
                     AND dp.table_id IS NULL
                     AND dp.perm_type = 'perms/create-queries'
                     AND (dp.perm_value = 'query-builder'
                          OR dp.perm_value = 'query-builder-and-native') ) THEN 'unrestricted'
           WHEN EXISTS
                  (SELECT 1
                   FROM data_permissions dp
                   WHERE dp.group_id = pg.id
                     AND dp.db_id = md.id
                     AND dp.table_id IS NULL
                     AND dp.perm_type = 'perms/view-data'
                     AND (dp.perm_value = 'unrestricted'
                          OR dp.perm_value = 'legacy-no-self-service') )
                AND EXISTS
                  (SELECT 1
                   FROM data_permissions dp
                   WHERE dp.group_id = pg.id
                     AND dp.db_id = md.id
                     AND dp.table_id IS NULL
                     AND dp.perm_type = 'perms/create-queries'
                     AND dp.perm_value = 'no')
                AND NOT EXISTS
                  (SELECT 1
                   FROM connection_impersonations ci
                   WHERE ci.db_id = md.id
                     AND ci.group_id = pg.id) THEN 'no-self-service'
            ELSE 'block'
       END AS perm_value
FROM permissions_group pg
CROSS JOIN metabase_database md
WHERE pg.name != 'Administrators'
  AND EXISTS
    (SELECT 1
     FROM data_permissions dp
     WHERE dp.group_id = pg.id
       AND dp.db_id = md.id
       AND dp.table_id IS NULL
       AND dp.perm_type = 'perms/create-queries')
  AND NOT EXISTS
    (SELECT 1
     FROM data_permissions dp
     WHERE dp.group_id = pg.id
       AND dp.db_id = md.id
       AND dp.perm_type = 'perms/data-access' );


INSERT INTO data_permissions (group_id, perm_type, db_id, schema_name, table_id, perm_value)
SELECT pg.id AS group_id,
       'perms/data-access' AS perm_type,
       mt.db_id AS db_id,
       mt.schema AS schema_name,
       mt.id AS table_id,
       CASE
           WHEN EXISTS
                  (SELECT 1
                   FROM data_permissions dp
                   WHERE dp.group_id = pg.id
                     AND dp.table_id = mt.id
                     AND dp.perm_type = 'perms/create-queries'
                     AND dp.perm_value = 'query-builder' ) THEN 'unrestricted'
           ELSE 'no-self-service'
       END AS perm_value
FROM permissions_group pg
CROSS JOIN metabase_table mt
WHERE pg.name != 'Administrators'
  AND EXISTS
    (SELECT 1
     FROM data_permissions dp
     WHERE dp.group_id = pg.id
       AND dp.table_id = mt.id
       AND dp.perm_type = 'perms/create-queries');

DELETE
FROM data_permissions
WHERE perm_type = 'perms/view-data';

DELETE
FROM data_permissions
WHERE perm_type = 'perms/create-queries';
