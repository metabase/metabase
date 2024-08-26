DELETE FROM permissions WHERE object LIKE '/db/%' AND object NOT LIKE '/db/%/native/';
DELETE FROM permissions WHERE object LIKE '/block/db/%';

-- Insert unrestricted permissions for databases, excluding those with sandboxed tables
INSERT INTO permissions (object, group_id)
SELECT concat('/db/', dp.db_id, '/schema/'),
       dp.group_id
FROM data_permissions dp
WHERE dp.perm_type = 'perms/data-access'
  AND dp.perm_value = 'unrestricted'
  AND dp.table_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sandboxes sb
    JOIN metabase_table mt ON sb.table_id = mt.id
    WHERE mt.db_id = dp.db_id
      AND sb.group_id = dp.group_id
);

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
              replace(replace(dp.schema_name, '\\', '\\\\'), '/', '\\/'),
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

-- Insert unrestricted permissions for every table in a DB if the DB has unrestricted access and any table in the DB has a sandbox,
-- excluding the sandboxed tables themselves
INSERT INTO permissions (object, group_id)
SELECT concat('/db/',
              mt.db_id,
              '/schema/',
              replace(replace(mt.schema, '\\', '\\\\'), '/', '\\/'),
              '/table/',
              mt.id,
              '/'),
       dp.group_id
FROM metabase_table mt
JOIN data_permissions dp ON mt.db_id = dp.db_id
WHERE dp.perm_type = 'perms/data-access'
  AND dp.perm_value = 'unrestricted'
  AND dp.table_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sandboxes sb
    WHERE sb.table_id = mt.id
    AND sb.group_id = dp.group_id
  )
  AND EXISTS (
    SELECT 1
    FROM sandboxes sb2
    JOIN metabase_table mt2 ON sb2.table_id = mt2.id
    WHERE mt2.db_id = mt.db_id
    AND sb2.group_id = dp.group_id
  );

-- Insert segmented permission paths for sandboxed tables
INSERT INTO permissions (object, group_id)
SELECT concat('/db/',
              mt.db_id,
              '/schema/',
              replace(replace(mt.schema, '\\', '\\\\'), '/', '\\/'),
              '/table/',
              sb.table_id,
              '/query/segmented/'),
       sb.group_id
FROM sandboxes sb
JOIN metabase_table mt ON sb.table_id = mt.id;
