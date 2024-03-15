INSERT INTO data_permissions (group_id, perm_type, db_id, perm_value)
SELECT pg.id AS group_id,
       'perms/view-data' AS perm_type,
       md.id AS db_id,
       CASE
           WHEN EXISTS (
               -- Existing block permissions at DB level
               SELECT 1 FROM data_permissions dp
               WHERE dp.group_id = pg.id
                 AND dp.db_id = md.id
                 AND dp.table_id IS NULL
                 AND dp.perm_type = 'perms/data-access'
                 AND dp.perm_value = 'block'
           ) THEN 'blocked'
           WHEN EXISTS (
               -- If there is no-self-service at DB level or granular perms, we need to check if any users are in both this group
               -- and another group with block perms, impersonation, or sandboxing for the DB. If so, we set `legacy-no-self-service`.
               SELECT 1
               FROM permissions_group_membership pgm
               WHERE pgm.group_id = pg.id
                 AND (
                     EXISTS (
                         SELECT 1
                         FROM data_permissions dp
                         WHERE dp.group_id = pgm.group_id
                           AND dp.db_id = md.id
                           AND dp.perm_type = 'perms/data-access'
                           AND (dp.perm_value = 'no-self-service' OR dp.perm_value IS NULL)
                     ) OR NOT EXISTS (
                         SELECT 1
                         FROM data_permissions dp
                         WHERE dp.group_id = pgm.group_id
                           AND dp.db_id = md.id
                           AND dp.table_id IS NULL
                     )
                 )
                 AND (
                     EXISTS (
                         -- User in other groups with block perms for the DB
                         SELECT 1
                         FROM permissions_group_membership pgm_inner
                         JOIN data_permissions dp ON dp.group_id = pgm_inner.group_id
                         WHERE dp.db_id = md.id
                           AND dp.perm_value = 'block'
                           AND pgm_inner.user_id = pgm.user_id
                     ) OR EXISTS (
                         -- Impersonation policy for the DB
                         SELECT 1
                         FROM permissions_group_membership pgm_inner
                         JOIN connection_impersonations ci ON ci.group_id = pgm_inner.group_id
                         WHERE ci.db_id = md.id
                           AND pgm_inner.user_id = pgm.user_id
                     ) OR EXISTS (
                         -- Sandboxing policy for any table in the DB
                         SELECT 1
                         FROM permissions_group_membership pgm_inner
                         JOIN sandboxes s ON s.group_id = pgm_inner.group_id
                         JOIN metabase_table mt ON mt.id = s.table_id AND mt.db_id = md.id
                         WHERE pgm_inner.user_id = pgm.user_id
                     )
                 )
           ) THEN 'legacy-no-self-service'
           ELSE 'unrestricted'
       END AS perm_value
FROM permissions_group pg
CROSS JOIN metabase_database md
WHERE pg.name != 'Administrators'
  AND NOT EXISTS (
      SELECT 1
      FROM data_permissions dp
      WHERE dp.group_id = pg.id
        AND dp.db_id = md.id
        AND dp.table_id IS NULL
        AND dp.perm_type = 'perms/view-data'
  );
