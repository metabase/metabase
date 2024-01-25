drop view if exists v_users;

create or replace view v_users as
select
    id as user_id,
    concat('user_', id) as entity_qualified_id,
    email,
    first_name,
    last_name,
    concat(first_name, ' ', last_name) as full_name,
    date_joined,
    last_login,
    updated_at,
    is_superuser as is_admin,
    is_active,
    sso_source,
    locale
    from core_user
union
select
    0 as user_id,
    'user_0' as entity_qualified_id,
    null as email,
    'External' as first_name,
    'User' as last_name,
    'External User' as full_name,
    null as date_joined,
    null as last_login,
    null as updated_at,
    false as is_admin,
    null as is_active,
    null as sso_source,
    null as locale
    from core_user;
