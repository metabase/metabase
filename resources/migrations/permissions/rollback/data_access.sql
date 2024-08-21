DELETE FROM permissions WHERE object LIKE '/db/%' AND object NOT LIKE '/db/%/native/';
DELETE FROM permissions WHERE object LIKE '/block/db/%';

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

-- Insert unrestricted permissions for tables, excluding those with sandboxed permissions
INSERT INTO permissions (object, group_id)
SELECT concat('/db/',
              dp.db_id,
              '/schema/',
              replace(replace(dp.schema_name, '\', '\\'), '/', '\/'),
              '/table/',
              dp.table_id,
              '/'),
       dp.group_id
FROM data_permissions dp
LEFT JOIN sandboxes sb ON dp.table_id = sb.table_id AND dp.group_id = sb.group_id
WHERE dp.perm_type = 'perms/data-access'
  AND dp.perm_value = 'unrestricted'
  AND dp.table_id IS NOT NULL
  AND sb.table_id IS NULL;

-- Insert segmented permission paths for sandboxed tables
INSERT INTO permissions (object, group_id)
SELECT concat('/db/',
              dp.db_id,
              '/schema/',
              replace(replace(dp.schema_name, '\', '\\'), '/', '\/'),
              '/table/',
              dp.table_id,
              '/query/segmented/'),
       dp.group_id
FROM sandboxes sb
JOIN data_permissions dp ON sb.table_id = dp.table_id AND sb.group_id = dp.group_id
WHERE dp.perm_type = 'perms/data-access'
  AND dp.table_id IS NOT NULL;
