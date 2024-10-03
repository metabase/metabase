DELETE FROM permissions
WHERE id IN (
  SELECT p.id
  FROM permissions p
  LEFT OUTER JOIN collection c
  ON p.object = '/collection/' || c.id || '/' OR p.object = '/collection/' || c.id || '/read/'
  WHERE c.id IS NULL AND p.object ~ '^/collection/\d+/(read/)?$'
);

UPDATE permissions
SET
  -- extract the collection_id from the object path
  collection_id = cast(substring(object from '/collection/(\d+)/') as integer),

  -- set the perm_type for matching permissions
  perm_type = 'perms/collection-access',

  -- set perm_value based on the presence of 'read/' in the object
  perm_value = CASE
    WHEN object LIKE '/collection/%/read/' THEN 'read'
    WHEN object LIKE '/collection/%/' THEN 'read-and-write'
    ELSE null
  END
WHERE
  -- only update rows that match the collection pattern
  object ~ '^/collection/\d+/(read/)?$';
