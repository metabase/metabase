-- Queries for the SSO module. Private sqlvec builders wrapped into executors in
-- metabase.sso.queries; see metabase.app-db.hugsql. Literal SQL only; input flows through value
-- params. Portable across H2, MySQL, Postgres.
--
-- NB: never start a comment line with a `:keyword:` -- HugSQL's parser reads any leading keyword in
-- a `--` comment as a header directive and fails with "Missing HugSQL Header".

-- :name- user-group-ids-excluding :? :*
-- The PermissionsGroup ids the user belongs to, minus the excluded ones. The excluded set expands
-- into one ? per element, so the caller must pass a non-empty collection; metabase.sso.queries
-- guarantees that with app-db.hugsql/non-empty-not-in (NOT non-empty-in -- NOT IN (NULL) is NULL,
-- which would filter out every row).
SELECT group_id
FROM permissions_group_membership
WHERE user_id = :value:user-id
  AND group_id NOT IN (:value*:excluded-group-ids)

-- :name- user-group-ids-among :? :*
-- As above, but restricted to a caller-supplied candidate set. Both id collections expand to ? per
-- element; neither may be empty.
SELECT group_id
FROM permissions_group_membership
WHERE user_id = :value:user-id
  AND group_id IN (:value*:group-ids)
  AND group_id NOT IN (:value*:excluded-group-ids)

-- :name- auth-identity-exists :? :1
-- 1 when the user has an AuthIdentity for the provider, no row otherwise. SELECT 1 + LIMIT 1
-- rather than COUNT(*): the caller only needs existence, and this stops at the first match.
SELECT 1 AS one
FROM auth_identity
WHERE user_id = :value:user-id
  AND provider = :value:provider
LIMIT 1
