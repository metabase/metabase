DROP VIEW IF EXISTS v_group_members;


CREATE OR REPLACE VIEW v_group_members AS
SELECT user_id,
       permissions_group.id AS group_id,
       permissions_group.name AS group_name
FROM permissions_group_membership
LEFT JOIN permissions_group ON permissions_group_membership.group_id = permissions_group.id
UNION
SELECT 0 AS user_id,
       0 AS group_id,
       'Anonymous users' AS group_name ;
