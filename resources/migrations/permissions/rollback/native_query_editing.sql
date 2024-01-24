DELETE FROM permissions WHERE object LIKE '/db/%/native/';

INSERT INTO permissions (object, group_id)
SELECT concat('/db/', dp.db_id, '/native/'),
       dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/native-query-editing'
  AND dp.perm_value = 'yes'
  AND dp.table_id IS NULL;
