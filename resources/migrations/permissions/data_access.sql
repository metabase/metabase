INSERT INTO permissions_v2 (group_id, type, db_id, schema, table_id, object_id, "VALUE")
SELECT
    pg.id AS group_id,
    'data-access' AS type,
    mt.db_id,
    mt.schema AS schema,
    mt.id AS table_id,
    NULL AS object_id,
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM permissions p
            WHERE
                p.group_id = pg.id AND
                (
                    p.object = CONCAT('/db/', mt.db_id, '/') OR
                    p.object = CONCAT('/db/', mt.db_id, '/schema/', mt.schema, '/') OR
                    p.object = CONCAT('/db/', mt.db_id, '/schema/', mt.schema, '/table/', mt.id, '/') OR
                    p.object = CONCAT('/db/', mt.db_id, '/schema/', mt.schema, '/table/', mt.id, '/query/') OR
                    p.object = CONCAT('/db/', mt.db_id, '/schema/', mt.schema, '/table/', mt.id, '/query/segmented/')
                )
        ) THEN 'unrestricted'
        WHEN EXISTS (
            SELECT 1
            FROM permissions p
            WHERE
                p.group_id = pg.id AND
                p.object = CONCAT('/block/db/', mt.db_id, '/')
        ) THEN 'block'
        ELSE 'no-self-service'
    END AS "VALUE"
FROM
    permissions_group pg
CROSS JOIN
    metabase_table mt
WHERE
    pg.name != 'Administrators'
AND NOT EXISTS (
    SELECT 1 FROM permissions_v2 pv2
    WHERE
        pv2.group_id = pg.id AND
        pv2.table_id = mt.id AND
        pv2.type = 'data-access'
);
