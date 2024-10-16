-- Downgrade table-level native access to query-builder-only access
UPDATE data_permissions
SET perm_value = 'query-builder'
WHERE perm_value = 'query-builder-and-native'
AND table_id IS NOT NULL;

-- Coalesce table-level perms to DB perms: if all tables in a DB have 'query-builder' access, insert a DB-level perm
-- instead, with a NULL schema and table ID
INSERT INTO data_permissions (
    group_id,
    perm_type,
    db_id,
    schema_name,
    table_id,
    perm_value
)
SELECT
  dp.group_id,
  'perms/create-queries' AS perm_type,
  dp.db_id,
  NULL AS schema_name,
  NULL AS table_id,
  'query-builder' AS perm_value
FROM data_permissions dp
WHERE dp.table_id IS NOT NULL
  AND dp.perm_value = 'query-builder'
  AND NOT EXISTS (
      SELECT 1
      FROM data_permissions dp2
      WHERE dp2.group_id = dp.group_id
        AND dp2.db_id = dp.db_id
        AND dp2.schema_name IS NOT NULL
        AND dp2.perm_value = 'no'
        AND dp2.table_id IS NOT NULL
  )
GROUP BY dp.group_id, dp.db_id;

-- Delete table-level permissions if a DB-level permission was created
DELETE FROM data_permissions
WHERE perm_value = 'query-builder'
  AND table_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM data_permissions dp2
      WHERE dp2.group_id = data_permissions.group_id
        AND dp2.db_id = data_permissions.db_id
        AND dp2.schema_name IS NULL
        AND dp2.table_id IS NULL
        AND dp2.perm_value = 'query-builder'
  );
