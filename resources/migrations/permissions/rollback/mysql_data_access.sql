DELETE FROM permissions WHERE object LIKE '/db/%' AND object NOT LIKE '/db/%/native/';

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
              replace(replace(dp.schema_name, '\\', '\\\\'), '/', '\\/'),
              '/table/',
              dp.table_id,
              '/'),
       dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/data-access'
  AND dp.perm_value = 'unrestricted'
AND dp.table_id IS NOT NULL;
