-- Insert table-level view-data permissions when necessary: when a group has
-- table-level data-access permissions, and some of the `no-self-service` rows
-- cannot be automatically migrated to `unrestricted` due to conflicts with
-- other groups
INSERT INTO
  data_permissions (
    group_id,
    perm_type,
    db_id,
    schema_name,
    table_id,
    perm_value
  )
SELECT
  pg.id AS group_id,
  'perms/view-data' AS perm_type,
  mt.db_id AS db_id,
  mt.schema AS schema_name,
  mt.id AS table_id,
  CASE
    WHEN EXISTS (
      -- If the table has `no-self-service`, convert it to `legacy-no-self-service`
      SELECT
        1
      FROM
        data_permissions dp
      WHERE
        dp.group_id = pg.id
        AND dp.db_id = mt.db_id
        AND dp.table_id = mt.id
        AND dp.perm_type = 'perms/data-access'
        AND dp.perm_value = 'no-self-service'
    ) THEN 'legacy-no-self-service'
    -- Otherwise set the table to `unrestricted`. Sandboxed tables are
    -- `unrestricted` in `data_permissions`and have the sandbox definition
    -- stored separately
    ELSE 'unrestricted'
  END AS perm_value
FROM
  permissions_group pg
  CROSS JOIN metabase_table mt
WHERE
  pg.name != 'Administrators'
  -- Only select group/table combinations where table-level `data-access` perms
  -- are set AND there is at least one `no-self-service` table in the DB that
  -- cannot be automatically migrated to `unrestricted`
  AND EXISTS (
    SELECT
      1
    FROM
      data_permissions dp
    WHERE
      dp.group_id = pg.id
      AND dp.db_id = mt.db_id
      AND dp.table_id IS NOT NULL
      AND dp.perm_type = 'perms/data-access'
      AND dp.perm_value = 'no-self-service'
  )
  AND EXISTS (
    SELECT
      1
    FROM
      permissions_group_membership pgm
    WHERE
      pgm.group_id <> pg.id
      AND pgm.user_id IN (
        SELECT
          user_id
        FROM
          permissions_group_membership pgm_inner
        WHERE
          pgm_inner.group_id = pg.id
      )
    AND (
      EXISTS (
        -- User in another group with block perms for the DB
        SELECT
          1
        FROM
          data_permissions dp
        WHERE
          dp.group_id = pgm.group_id
          AND dp.db_id = mt.db_id
          AND dp.table_id IS NULL
          AND dp.perm_value = 'block'
      )
      OR EXISTS (
        -- User in another group with impersonation for the DB
        SELECT
          1
        FROM
          connection_impersonations ci
        WHERE
          ci.group_id = pgm.group_id
          AND ci.db_id = mt.db_id
      )
      OR EXISTS (
        -- User in another group with sandboxing for any table in the DB
        -- that has `no-self-service` perms
        SELECT
          1
        FROM
          sandboxes s
          JOIN metabase_table mt_inner ON mt_inner.id = s.table_id
        WHERE
          s.group_id = pgm.group_id
          AND mt_inner.db_id = mt.db_id
          AND s.table_id IN (
            SELECT
              table_id
            FROM
              data_permissions dp_inner
            WHERE
              dp_inner.group_id = pg.id
              AND dp_inner.perm_type = 'perms/data-access'
              AND dp_inner.perm_value = 'no-self-service'
              AND dp_inner.table_id IS NOT NULL
          )
       )
  )
);

-- Insert DB-level view data permissions for all groups & DBs that don't have
-- table-level permissions set.
INSERT INTO
  data_permissions (group_id, perm_type, db_id, perm_value)
SELECT
  pg.id AS group_id,
  'perms/view-data' AS perm_type,
  md.id AS db_id,
  CASE
    WHEN EXISTS (
      -- Existing block permissions at DB level
      SELECT
        1
      FROM
        data_permissions dp
      WHERE
        dp.group_id = pg.id
        AND dp.db_id = md.id
        AND dp.table_id IS NULL
        AND dp.perm_type = 'perms/data-access'
        AND dp.perm_value = 'block'
    ) THEN 'blocked'
    WHEN EXISTS (
      -- If there is no-self-service at DB level, we need to check if
      -- any users are in both this group and another group with block
      -- perms, impersonation, or sandboxing for the DB. If so, we set
      -- `legacy-no-self-service`.
      SELECT
        1
      FROM
        permissions_group_membership pgm
      WHERE
        pgm.group_id = pg.id
        AND (
          EXISTS (
            SELECT
              1
            FROM
              data_permissions dp
            WHERE
              dp.group_id = pgm.group_id
              AND dp.db_id = md.id
              AND dp.table_id IS NULL
              AND dp.perm_type = 'perms/data-access'
              AND dp.perm_value = 'no-self-service'
          )
        )
        AND (
          EXISTS (
            -- User in other groups with block perms for the DB
            SELECT
              1
            FROM
              permissions_group_membership pgm_inner
              JOIN data_permissions dp ON dp.group_id = pgm_inner.group_id
            WHERE
              dp.db_id = md.id
              AND dp.perm_value = 'block'
              AND pgm_inner.user_id = pgm.user_id
          )
          OR EXISTS (
            -- Impersonation policy for the DB
            SELECT
              1
            FROM
              permissions_group_membership pgm_inner
              JOIN connection_impersonations ci ON ci.group_id = pgm_inner.group_id
            WHERE
              ci.db_id = md.id
              AND pgm_inner.user_id = pgm.user_id
          )
          OR EXISTS (
            -- Sandboxing policy for any table in the DB
            SELECT
              1
            FROM
              permissions_group_membership pgm_inner
              JOIN sandboxes s ON s.group_id = pgm_inner.group_id
              JOIN metabase_table mt ON mt.id = s.table_id
            WHERE
              mt.db_id = md.id
              AND pgm_inner.user_id = pgm.user_id
          )
        )
    ) THEN 'legacy-no-self-service'
    ELSE 'unrestricted'
  END AS perm_value
FROM
  permissions_group pg
  CROSS JOIN metabase_database md
WHERE
  pg.name != 'Administrators'
  AND NOT EXISTS (
    SELECT
      1
    FROM
      data_permissions dp
    WHERE
      dp.group_id = pg.id
      AND dp.db_id = md.id
      AND dp.perm_type = 'perms/view-data'
  );
