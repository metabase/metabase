INSERT INTO data_permissions (group_id, TYPE, db_id, SCHEMA, table_id, perm_value)
SELECT pg.id AS group_id,
       'native-query-editing' AS TYPE,
       md.id AS db_id,
       NULL AS SCHEMA,
       NULL AS table_id,
       CASE
           WHEN EXISTS
                  (SELECT 1
                   FROM permissions p
                   WHERE p.group_id = pg.id
                     AND (p.object = concat('/db/', md.id, '/')
                          OR p.object = concat('/db/', md.id, '/native/'))) THEN 'yes'
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
       AND dp.type = 'native-query-editing' );
