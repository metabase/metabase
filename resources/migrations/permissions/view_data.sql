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
  dp.group_id,
  'perms/view-data' AS perm_type,
  dp.db_id,
  dp.schema_name,
  dp.table_id,
  'legacy-no-self-service' AS perm_value
FROM
  data_permissions dp
WHERE
  dp.table_id IS NOT NULL
  AND dp.perm_type = 'perms/data-access'
  AND dp.perm_value = 'no-self-service'
  AND EXISTS (
    SELECT
      1
    FROM
      permissions_group_membership pgm
      JOIN (
        SELECT
          group_id,
          db_id,
          CAST(NULL AS INTEGER) AS table_id
        FROM
          connection_impersonations
        UNION
        SELECT
          group_id,
          db_id,
          CAST(NULL AS INTEGER) AS table_id
        FROM
          data_permissions
        WHERE
          perm_value = 'block'
          AND table_id IS NULL
        UNION
        SELECT
          group_id,
          CAST(NULL AS INTEGER) as db_id,
          table_id
        FROM
          sandboxes
      ) AS sp ON pgm.group_id = sp.group_id
    WHERE
      pgm.group_id <> dp.group_id
      AND (
        sp.db_id IS NULL
        OR sp.db_id = dp.db_id
      )
      AND (
        sp.table_id IS NULL
        OR sp.table_id = dp.table_id
      )
  );

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
  dp.group_id,
  'perms/view-data' AS perm_type,
  dp.db_id,
  dp.schema_name,
  dp.table_id,
  'unrestricted' AS perm_value
FROM
  data_permissions dp
WHERE
  dp.table_id IS NOT NULL
  AND dp.perm_type = 'perms/data-access'
  AND NOT EXISTS (
    SELECT
      1
    FROM
    data_permissions dp1
    WHERE
     dp1.group_id = dp.group_id
     AND dp1.table_id = dp.table_id
     AND dp1.perm_value = 'legacy-no-self-service'
  );

-- If all tables in a DB have the same view-data permission, insert a DB-level view-data permission instead
INSERT INTO
  data_permissions (
    group_id,
    perm_type,
    db_id,
    schema_name,
    table_id,
    perm_value
  )
WITH
  ConsistentPermissions AS (
    SELECT
      group_id,
      db_id,
      MIN(perm_value) AS common_value
    FROM
      data_permissions
    WHERE
      table_id IS NOT NULL
      AND perm_type = 'perms/view-data'
    GROUP BY
      group_id,
      db_id
    HAVING
      COUNT(DISTINCT perm_value) = 1
  )
SELECT
  cp.group_id,
  'perms/view-data',
  cp.db_id,
  NULL,
  NULL,
  cp.common_value
FROM
  ConsistentPermissions cp;

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

-- Remove table-level view-data permissions for groups that have DB-level permissions set
DELETE FROM data_permissions
WHERE
  (group_id, db_id) IN (
    SELECT
      group_id,
      db_id
    FROM
      data_permissions
    WHERE
      table_id IS NULL
      AND perm_type = 'perms/view-data'
  )
AND perm_type = 'perms/view-data'
AND table_id IS NOT NULL;
