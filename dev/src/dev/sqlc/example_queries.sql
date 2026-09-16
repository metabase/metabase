-- name: GlossaryEntry :one
SELECT * FROM glossary WHERE id = $1;

-- name: GlossaryEntriesSearch :many
SELECT * FROM glossary
WHERE (LOWER(term) LIKE $1 ESCAPE '!' OR LOWER(definition) LIKE $1 ESCAPE '!')
ORDER BY term ASC;

-- name: UsersById :many
SELECT id, email, first_name, last_name
FROM core_user WHERE id = ANY($1::int[]);

-- name: UserGroupIdsExcluding :many
SELECT group_id FROM permissions_group_membership
WHERE user_id = $1 AND group_id <> ALL($2::int[]);

-- name: AuthIdentityExists :one
SELECT 1 AS one FROM auth_identity
WHERE user_id = $1 AND provider = $2 LIMIT 1;

-- name: InsertGlossaryEntry :exec
INSERT INTO glossary (term, definition, creator_id, created_at, updated_at)
VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
