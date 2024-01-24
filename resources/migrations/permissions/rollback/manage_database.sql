DELETE FROM permissions WHERE object LIKE '/details/db/%';

INSERT INTO permissions (object, group_id)
SELECT concat('/details/db/', dp.db_id, '/'),
       dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/manage-database'
  AND dp.perm_value = 'yes'
AND dp.table_id IS NULL;
