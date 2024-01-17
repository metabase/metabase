drop view if exists v_users;

create or replace view v_users as
select
    id as user_id,
    'user_' || id as entity_qualified_id,
    email,
    first_name,
    last_name,
    first_name || ' ' || last_name as full_name,
    date_joined,
    last_login,
    updated_at,
    is_superuser as is_admin,
    is_active,
    sso_source,
    locale
    from core_user;
