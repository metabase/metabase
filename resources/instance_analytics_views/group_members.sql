drop view if exists v_group_members;

create or replace view v_group_members as
select
    user_id,
    permissions_group.id as group_id,
    permissions_group.name as group_name
    from permissions_group_membership
        left join permissions_group on permissions_group_membership.group_id = permissions_group.id
