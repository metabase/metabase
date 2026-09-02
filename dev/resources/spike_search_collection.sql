-- SPIKE: the search "collection" arm as fully static SQL.
--
-- Every filter that HoneySQL adds or omits as a whole clause is present here unconditionally and
-- gated by an int flag, so one statement covers all filter combinations. See the POC PR for why
-- int flags rather than `? IS NULL` (Postgres param typing) and why this does not cost an index
-- seek (narrow-then-filter: the permission-scoped id set leads and is sargable).
--
-- Differences from the HoneySQL original, all deliberate:
--   * the current user id is a :value: param, not inlined into the SQL text as HoneySQL does.
--     Same text for every user, so the statement cache is actually reusable.
--   * `verified` and `created-by` are absent: those filters throw for collection upstream
--     (`:verified filter for collection is not supported`), so the arm never carries them.

-- :snip- collection-arm
SELECT 'collection' AS model,
       collection.id AS id,
       collection.name AS name,
       CAST(NULL AS VARCHAR) AS display_name,
       collection.description AS description,
       collection.archived AS archived,
       collection.id AS collection_id,
       collection.name AS collection_name,
       collection.type AS collection_type,
       CAST(NULL AS VARCHAR) AS collection_location,
       collection.authority_level AS collection_authority_level,
       collection.archived_directly AS archived_directly,
       CAST(NULL AS INTEGER) AS collection_position,
       CAST(NULL AS INTEGER) AS creator_id,
       collection.created_at AS created_at,
       CASE WHEN bookmark.id IS NOT NULL THEN TRUE ELSE FALSE END AS bookmark,
       CAST(NULL AS TIMESTAMP) AS updated_at,
       collection.location AS location
FROM collection
LEFT JOIN collection_bookmark bookmark
       ON bookmark.collection_id = collection.id
      AND bookmark.user_id = :value:current-user-id
WHERE LOWER(collection.name) LIKE :value:search-term
  AND collection.archived = :value:archived

  -- Permission scope. This is the DRIVING filter: mandatory, selective, and indexed, so the
  -- flag-gated predicates below apply to an already-narrow set. Superuser skips the check via the
  -- flag; everyone else is restricted to readable ids plus the trash collection.
  AND (:value:is-superuser = 1
       OR collection.id IN (:value*:readable-collection-ids)
       OR collection.id = :value:trash-collection-id)

  -- Tenant collections are excluded for everyone (matches the NOT EXISTS in the original).
  AND NOT EXISTS (SELECT 1 FROM collection sub_c
                  WHERE sub_c.id = collection.id
                    AND sub_c.namespace = 'shared-tenant-collection')

  -- Namespace scope: NULL namespace, or the requested one.
  AND (collection.namespace IS NULL OR collection.namespace = :value:namespace)

  -- Personal-collection mode, as one predicate over two int flags:
  --   want-personal: -1 = no restriction, 1 = must be personal, 0 = must not be, 2 = mine-or-none
  --   mine-only:      1 = restrict "personal" to the current user's own
  -- `personal-root` is the location of the caller's own personal collection ('/<id>/').
  AND (:value:want-personal = -1

       OR (:value:want-personal = 1 AND :value:mine-only = 0
           AND (collection.personal_owner_id IS NOT NULL
                OR EXISTS (SELECT 1 FROM collection pc
                           WHERE pc.personal_owner_id IS NOT NULL
                             AND collection.location LIKE CONCAT('/', pc.id, '/%'))))

       OR (:value:want-personal = 1 AND :value:mine-only = 1
           AND (collection.personal_owner_id = :value:current-user-id
                OR collection.location LIKE :value:personal-root))

       OR (:value:want-personal = 0
           AND collection.personal_owner_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM collection pc
                           WHERE pc.personal_owner_id IS NOT NULL
                             AND collection.location LIKE CONCAT('/', pc.id, '/%')))

       OR (:value:want-personal = 2
           AND (collection.personal_owner_id = :value:current-user-id
                OR collection.location LIKE :value:personal-root
                OR (collection.personal_owner_id IS NULL
                    AND NOT EXISTS (SELECT 1 FROM collection pc
                                    WHERE pc.personal_owner_id IS NOT NULL
                                      AND collection.location LIKE CONCAT('/', pc.id, '/%'))))))
