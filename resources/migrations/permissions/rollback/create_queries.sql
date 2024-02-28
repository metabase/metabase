DELETE
FROM data_permissions
WHERE perm_type = 'perms/native-query-editing';


INSERT INTO data_permissions (group_id, perm_type, db_id, perm_value)
SELECT pg.id AS group_id,
       'perms/native-query-editing' AS perm_type,
       md.id AS db_id,
       CASE
           WHEN EXISTS
                  (SELECT 1
                   FROM data_permissions dp
                   WHERE dp.group_id = pg.id
                     AND dp.db_id = md.id
                     AND dp.table_id IS NULL
                     AND dp.perm_type = 'perms/create-queries'
                     AND dp.perm_value = 'query-builder-and-native' ) THEN 'yes'
           ELSE 'no'
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
       AND dp.perm_type = 'perms/create-queries');
