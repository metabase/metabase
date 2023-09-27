create or replace view v_group_members as
select
    id as user_id,
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
