-- Insert DB-level permissions with a check for table-level permissions
INSERT INTO data_permissions (group_id, type, db_id, schema, table_id, perm_value)
SELECT
    pg.id AS group_id,
    'data-access' AS type,
    md.id AS db_id,
    NULL AS schema,
    NULL AS table_id,
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM permissions p
            WHERE p.group_id = pg.id AND p.object = CONCAT('/db/', md.id, '/')
        ) THEN 'unrestricted'
        WHEN EXISTS (
            SELECT 1
            FROM permissions p
            WHERE p.group_id = pg.id AND p.object = CONCAT('/block/db/', md.id, '/')
        ) THEN 'block'
        WHEN NOT EXISTS (
            SELECT 1
            FROM permissions p
            WHERE p.group_id = pg.id AND p.object LIKE CONCAT('/db/', md.id, '/%')
        ) THEN 'no-self-service'
    END AS perm_value
FROM
    permissions_group pg
CROSS JOIN
    metabase_database md
WHERE
    pg.name != 'Administrators'
AND NOT EXISTS (
    SELECT 1 FROM data_permissions dp
    WHERE dp.group_id = pg.id AND dp.db_id = md.id AND dp.type = 'data-access'
)
-- Filter out rows where perm_value would be NULL
AND CASE
        WHEN EXISTS (
            SELECT 1
            FROM permissions p
            WHERE p.group_id = pg.id AND p.object = CONCAT('/db/', md.id, '/')
        ) THEN TRUE
        WHEN EXISTS (
            SELECT 1
            FROM permissions p
            WHERE p.group_id = pg.id AND p.object = CONCAT('/block/db/', md.id, '/')
        ) THEN TRUE
        WHEN NOT EXISTS (
            SELECT 1
            FROM permissions p
            WHERE p.group_id = pg.id AND p.object LIKE CONCAT('/db/', md.id, '/%')
        ) THEN TRUE
        ELSE FALSE
    END;

-- Insert table-level permissions only where no DB-level permissions exist
INSERT INTO data_permissions (group_id, type, db_id, schema, table_id, perm_value)
SELECT
    pg.id AS group_id,
    'data-access' AS type,
    mt.db_id,
    mt.schema AS schema,
    mt.id AS table_id,
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM permissions p
            WHERE p.group_id = pg.id AND (
                p.object = CONCAT('/db/', mt.db_id, '/schema/', mt.schema, '/') OR
                p.object = CONCAT('/db/', mt.db_id, '/schema/', mt.schema, '/table/', mt.id, '/') OR
                p.object = CONCAT('/db/', mt.db_id, '/schema/', mt.schema, '/table/', mt.id, '/query/') OR
                p.object = CONCAT('/db/', mt.db_id, '/schema/', mt.schema, '/table/', mt.id, '/query/segmented/')
            )
        ) THEN 'unrestricted'
        ELSE 'no-self-service'
    END AS perm_value
FROM
    permissions_group pg
CROSS JOIN
    metabase_table mt
WHERE
    pg.name != 'Administrators'
AND NOT EXISTS (
    SELECT 1 FROM data_permissions dp
    WHERE dp.group_id = pg.id AND dp.db_id = mt.db_id AND dp.type = 'data-access'
)
AND NOT EXISTS (
    SELECT 1 FROM data_permissions dp
    WHERE dp.group_id = pg.id AND dp.db_id = mt.db_id AND dp.table_id IS NULL
);
