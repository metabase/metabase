DELETE p FROM permissions p
LEFT OUTER JOIN collection c
ON p.object = CONCAT('/collection/', c.id, '/') OR p.object = CONCAT('/collection/', c.id, '/read/')
WHERE c.id IS NULL AND p.object REGEXP '^/collection/\\d+/(read/)?$';

UPDATE permissions
SET
  -- extract the collection_id from the object path
  collection_id = cast(substring_index(substring_index(object, '/', 3), '/', -1) as unsigned integer),


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
  object regexp '^/collection/[0-9]+/(read/)?$';
