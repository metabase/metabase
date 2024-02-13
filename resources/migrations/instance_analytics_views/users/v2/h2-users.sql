DROP VIEW IF EXISTS v_users;


CREATE OR REPLACE VIEW v_users AS
SELECT id AS user_id,
       'user_' || id AS entity_qualified_id,
       type,
       CASE WHEN type = 'api-key' THEN null ELSE email END as email,
       first_name,
       last_name,
       first_name || ' ' || last_name AS full_name,
       date_joined,
       last_login,
       updated_at,
       is_superuser AS is_admin,
       is_active,
       sso_source,
       locale
FROM core_user
UNION
SELECT 0 AS user_id,
       'user_0' AS entity_qualified_id,
       'anonymous' as type,
       NULL AS email,
       'Anonymous' AS first_name,
       'User' AS last_name,
       'Anonymous User' AS full_name,
       NULL AS date_joined,
       NULL AS last_login,
       NULL AS updated_at,
       FALSE AS is_admin,
                NULL AS is_active,
                NULL AS sso_source,
                NULL AS locale ;
