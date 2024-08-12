INSERT INTO collection_permissions (group_id, perm_type, collection_namespace, collection_id, perm_value)
SELECT pg.id AS group_id,
       'perms/access' AS perm_type,
       c.namespace AS collection_namespace,
       c.id AS collection_id,
       CASE
           WHEN EXISTS
                  (SELECT 1
                   FROM permissions p
                   WHERE p.group_id = pg.id
                      AND (p.object = concat('/collection/', c.id, '/')
                          OR p.object = concat('/collection/namespace/', c.namespace, '/', c.id, '/')))
            THEN 'read-and-write'
            WHEN EXISTS
                  (SELECT 1
                   FROM permissions p
                   WHERE p.group_id = pg.id
                      AND (p.object = concat('/collection/', c.id, '/read/')
                          OR p.object = concat('/collection/namespace/', c.namespace, '/', c.id, '/read/')))
            THEN 'read'
            ELSE 'no'
        END AS perm_value
FROM permissions_group pg
CROSS JOIN collection c
WHERE pg.name != 'Administrators'
AND NOT EXISTS
  (SELECT 1 FROM collection_permissions cp
   WHERE cp.group_id=pg.id
   AND cp.collection_id=c.id
   AND cp.collection_namespace = c.namespace
   AND cp.perm_type = 'perms/access');


INSERT INTO collection_permissions (group_id, perm_type, collection_namespace, collection_id, perm_value)
SELECT pg.id AS group_id,
       'perms/access' AS perm_type,
       c.namespace AS collection_namespace,
       c.id AS collection_id,
       CASE
           WHEN c.namespace = 'analytics' THEN 'read'
           ELSE 'read-and-write'
       END AS perm_value
FROM permissions_group pg
CROSS JOIN collection c
WHERE pg.name = 'Administrators'
AND NOT EXISTS
  (SELECT 1 FROM collection_permissions cp
   WHERE cp.group_id=pg.id
   AND cp.collection_id=c.id
   AND cp.collection_namespace=c.namespace
   AND cp.perm_type = 'perms/access');

INSERT INTO collection_permissions (group_id, perm_type, collection_namespace, collection_id, perm_value)
SELECT pg.id AS group_id,
       'perms/access' AS perm_type,
       'snippets' AS collection_namespace,
       NULL AS collection_id,
       CASE
       WHEN EXISTS (
         SELECT 1 FROM permissions p
         WHERE p.group_id = pg.id
         AND p.object = '/collection/namespace/snippets/root/'
       ) THEN 'read-and-write'
       WHEN EXISTS (
         SELECT 1 FROM permissions p
         WHERE p.group_id = pg.id
         AND p.object = '/collection/namespace/snippets/root/read/'
       ) THEN 'read'
       ELSE 'no' END AS perm_value
FROM permissions_group pg
WHERE pg.name != 'Administrators'
AND NOT EXISTS (
  SELECT 1
  FROM collection_permissions cp
  WHERE cp.group_id = pg.id
  AND cp.collection_id IS NULL
  AND cp.collection_namespace = 'snippets'
  AND cp.perm_type = 'perms/access');

INSERT INTO collection_permissions (group_id, perm_type, collection_namespace, collection_id, perm_value)
SELECT pg.id AS group_id,
       'perms/access' AS perm_type,
       'snippets' AS collection_namespace,
       NULL AS collection_id,
       'read-and-write' AS perm_value
FROM permissions_group pg
WHERE pg.name = 'Administrators'
AND NOT EXISTS (
  SELECT 1
  FROM collection_permissions cp
  WHERE cp.group_id = pg.id
  AND cp.collection_id IS NULL
  AND cp.collection_namespace = 'snippets'
  AND cp.perm_type = 'perms/access');

INSERT INTO collection_permissions (group_id, perm_type, collection_namespace, collection_id, perm_value)
SELECT pg.id AS group_id,
       'perms/access' AS perm_type,
       NULL AS collection_namespace,
       NULL AS collection_id,
       CASE
       WHEN EXISTS (
         SELECT 1 FROM permissions p
         WHERE p.group_id = pg.id
         AND p.object = '/collection/root/'
       ) THEN 'read-and-write'
       WHEN EXISTS (
         SELECT 1 FROM permissions p
         WHERE p.group_id = pg.id
         AND p.object = '/collection/root/read/'
       ) THEN 'read'
       ELSE 'no'
       END AS perm_value
FROM permissions_group pg
WHERE pg.name != 'Administrators'
AND NOT EXISTS (
  SELECT 1
  FROM collection_permissions cp
  WHERE cp.group_id = pg.id
  AND cp.collection_id IS NULL
  AND cp.collection_namespace IS NULL
  AND cp.perm_type = 'perms/access');

INSERT INTO collection_permissions (group_id, perm_type, collection_namespace, collection_id, perm_value)
SELECT pg.id AS group_id,
       'perms/access' AS perm_type,
       NULL AS collection_namespace,
       NULL AS collection_id,
       'read-and-write' AS perm_value
FROM permissions_group pg
WHERE pg.name = 'Administrators'
AND NOT EXISTS (
  SELECT 1
  FROM collection_permissions cp
  WHERE cp.group_id = pg.id
  AND cp.collection_id IS NULL
  AND cp.collection_namespace IS NULL
  AND cp.perm_type = 'perms/access');
