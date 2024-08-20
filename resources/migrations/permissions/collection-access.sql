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
