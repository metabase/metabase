UPDATE permissions p SET collection_id = (
  SELECT id
  FROM collection c
  WHERE p.object = '/collection/' || c.id || '/'
  OR p.object = '/collection/' || c.id || '/read/'
),
perm_value = CASE
  WHEN object like '/collection/%/read/' THEN 'read'
  ELSE 'read-and-write'
END,
perm_type = 'perms/collection-access'
WHERE object LIKE '/collection/%';
