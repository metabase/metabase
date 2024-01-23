DELETE
FROM permissions
WHERE object LIKE '%/db/%';

-- DATA ACCESS

INSERT INTO permissions (object, group_id)
SELECT concat('/db/', dp.db_id, '/schema/'),
       dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/data-access'
  AND dp.perm_value = 'unrestricted'
  AND dp.table_id IS NULL;


INSERT INTO permissions (object, group_id)
SELECT concat('/block/db/', dp.db_id, '/'),
       dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/data-access'
  AND dp.perm_value = 'block'
  AND dp.table_id IS NULL;


INSERT INTO permissions (object, group_id)
SELECT concat('/db/',
              dp.db_id,
              '/schema/',
              replace(replace(dp.schema_name,
                              '\\', '\\\\'), '/', '\\/'), '/table/', dp.table_id, '/'),
       dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/data-access'
  AND dp.perm_value = 'unrestricted'
AND dp.table_id IS NOT NULL;


-- NATIVE QUERY EDITING

INSERT INTO permissions (object, group_id)
SELECT concat('/db/', dp.db_id, '/native/'),
       dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/native-query-editing'
  AND dp.perm_value = 'yes'
  AND dp.table_id IS NULL;

-- DOWNLOAD RESULTS

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
              replace(replace(dp.schema_name,
                              '\\', '\\\\'), '/', '\\/'), '/table/', dp.table_id, '/'),
       dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/download-results'
  AND dp.perm_value = 'one-million-rows'
AND dp.table_id IS NOT NULL;

INSERT INTO permissions (object, group_id)
SELECT concat('/download/limited/db/',
              dp.db_id,
              '/schema/',
              replace(replace(dp.schema_name,
                              '\\', '\\\\'), '/', '\\/'), '/table/', dp.table_id, '/'),
       dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/download-results'
  AND dp.perm_value = 'ten-thousand-rows'
AND dp.table_id IS NOT NULL;

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

-- MANAGE TABLE METADATA
INSERT INTO permissions (object, group_id)
SELECT concat('/data-model/db/', dp.db_id, '/'),
       dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/manage-table-metadata'
  AND dp.perm_value = 'yes'
  AND dp.table_id IS NULL;


INSERT INTO permissions (object, group_id)
SELECT concat('/data-model/db/',
              dp.db_id,
              '/schema/',
              replace(replace(dp.schema_name,
                              '\\', '\\\\'), '/', '\\/'), '/table/', dp.table_id, '/'),
       dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/manage-table-metadata'
  AND dp.perm_value = 'no'
AND dp.table_id IS NOT NULL;

-- MANAGE DATABASE
INSERT INTO permissions (object, group_id)
SELECT concat('/details/db/', dp.db_id, '/'),
       dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/manage-database'
  AND dp.perm_value = 'yes'
AND dp.table_id IS NULL;
