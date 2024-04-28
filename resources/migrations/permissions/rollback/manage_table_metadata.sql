DELETE FROM permissions WHERE object LIKE '/data-model/db/%';

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
              replace(replace(dp.schema_name, '\', '\\'), '/', '\/'),
              '/table/',
              dp.table_id,
              '/'),
       dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/manage-table-metadata'
  AND dp.perm_value = 'yes'
AND dp.table_id IS NOT NULL;
