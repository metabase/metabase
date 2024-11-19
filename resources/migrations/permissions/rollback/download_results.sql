DELETE FROM permissions WHERE object LIKE '/download/%';

INSERT INTO permissions (object, group_id)
SELECT concat('/download/db/', dp.db_id, '/'),
dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/download-results'
AND dp.perm_value = 'one-million-rows'
AND dp.table_id IS NULL;

INSERT INTO permissions (object, group_id)
SELECT concat('/download/limited/db/', dp.db_id, '/'),
dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/download-results'
AND dp.perm_value = 'ten-thousand-rows'
AND dp.table_id IS NULL;

INSERT INTO permissions (object, group_id)
SELECT concat('/download/db/',
              dp.db_id,
              '/schema/',
              replace(replace(dp.schema_name, '\', '\\'), '/', '\/'),
              '/table/',
              dp.table_id,
              '/'),
       dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/download-results'
  AND dp.perm_value = 'one-million-rows'
AND dp.table_id IS NOT NULL;

INSERT INTO permissions (object, group_id)
SELECT concat('/download/limited/db/',
              dp.db_id,
              '/schema/',
              replace(replace(dp.schema_name, '\', '\\'), '/', '\/'),
              '/table/',
              dp.table_id,
              '/'),
       dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/download-results'
  AND dp.perm_value = 'ten-thousand-rows'
AND dp.table_id IS NOT NULL;

-- TODO: this specific rollback is slow
INSERT INTO permissions (object, group_id)
SELECT DISTINCT ON (dp.db_id, dp.group_id)
  concat('/download/limited/db/',  dp.db_id,  '/native/'),
  dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/download-results'
  AND dp.perm_value IN ('ten-thousand-rows', 'one-million-rows')
  AND NOT EXISTS (
      -- Check for absence of 'no' permission at table level for the same db_id and group_id
      SELECT 1
      FROM data_permissions sub_dp
      WHERE sub_dp.db_id = dp.db_id
        AND sub_dp.group_id = dp.group_id
        AND sub_dp.perm_value = 'no'
        AND sub_dp.perm_type = 'perms/download-results'
  )
  AND NOT EXISTS (
      -- Check for absence of DB-level permission
      SELECT 1
      FROM data_permissions sub_dp
      WHERE sub_dp.db_id = dp.db_id
        AND sub_dp.group_id = dp.group_id
        AND sub_dp.table_id IS NULL
        AND sub_dp.perm_type = 'perms/download-results'
  );
