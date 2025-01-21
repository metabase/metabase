drop view if exists v_alerts;

create view v_alerts as
select
    n.id as entity_id,
    'notification_' || n.id as entity_qualified_id,
    n.created_at,
    n.updated_at,
    n.creator_id,
    nc.card_id,
    'card_' || nc.card_id as card_qualified_id,
    case
        when nc.send_condition = 'has_result' then 'rows'
        when nc.send_condition in ('goal_above', 'goal_below') then 'goal'
    end as alert_condition,
    case
        when REGEXP_SUBSTR(ns.cron_schedule, '^([^ ]+ ){3}([^ ]+)', 1, 1, '', 2) != '*' and
             (REGEXP_SUBSTR(ns.cron_schedule, '^([^ ]+ ){5}([^ ]+)', 1, 1, '', 2) = '?' or
              REGEXP_LIKE(REGEXP_SUBSTR(ns.cron_schedule, '^([^ ]+ ){5}([^ ]+)', 1, 1, '', 2), '^[0-9]#1$') or
              REGEXP_LIKE(REGEXP_SUBSTR(ns.cron_schedule, '^([^ ]+ ){5}([^ ]+)', 1, 1, '', 2), '^[0-9]L$')) then 'monthly'
        when REGEXP_SUBSTR(ns.cron_schedule, '^([^ ]+ ){5}([^ ]+)', 1, 1, '', 2) != '?' and 
             REGEXP_SUBSTR(ns.cron_schedule, '^([^ ]+ ){5}([^ ]+)', 1, 1, '', 2) != '*' then 'weekly'
        when REGEXP_SUBSTR(ns.cron_schedule, '^([^ ]+ ){2}([^ ]+)', 1, 1, '', 2) != '*' then 'daily'
        else 'hourly'
    end as schedule_type,
    case
        when REGEXP_LIKE(REGEXP_SUBSTR(ns.cron_schedule, '^([^ ]+ ){5}([^ ]+)', 1, 1, '', 2), '^1') then 'sun'
        when REGEXP_LIKE(REGEXP_SUBSTR(ns.cron_schedule, '^([^ ]+ ){5}([^ ]+)', 1, 1, '', 2), '^2') then 'mon'
        when REGEXP_LIKE(REGEXP_SUBSTR(ns.cron_schedule, '^([^ ]+ ){5}([^ ]+)', 1, 1, '', 2), '^3') then 'tue'
        when REGEXP_LIKE(REGEXP_SUBSTR(ns.cron_schedule, '^([^ ]+ ){5}([^ ]+)', 1, 1, '', 2), '^4') then 'wed'
        when REGEXP_LIKE(REGEXP_SUBSTR(ns.cron_schedule, '^([^ ]+ ){5}([^ ]+)', 1, 1, '', 2), '^5') then 'thu'
        when REGEXP_LIKE(REGEXP_SUBSTR(ns.cron_schedule, '^([^ ]+ ){5}([^ ]+)', 1, 1, '', 2), '^6') then 'fri'
        when REGEXP_LIKE(REGEXP_SUBSTR(ns.cron_schedule, '^([^ ]+ ){5}([^ ]+)', 1, 1, '', 2), '^7') then 'sat'
        else null
    end as schedule_day,
    case
        when REGEXP_SUBSTR(ns.cron_schedule, '^([^ ]+ ){2}([^ ]+)', 1, 1, '', 2) = '*' then null
        else cast(REGEXP_SUBSTR(ns.cron_schedule, '^([^ ]+ ){2}([^ ]+)', 1, 1, '', 2) as integer)
    end as schedule_hour,
    not n.active as archived,
    nh.channel_type as recipient_type,
    (select GROUP_CONCAT(cu.email)
     from notification_recipient nr
     left join core_user cu on nr.user_id = cu.id and nr.type = 'notification-recipient/user'
     where nr.notification_handler_id = nh.id) as recipients,
    (select GROUP_CONCAT(nr.details)
     from notification_recipient nr
     where nr.notification_handler_id = nh.id
     and nr.type = 'notification-recipient/raw-value') as recipient_external
from notification n
join notification_card nc on n.payload_id = nc.id
join notification_subscription ns on n.id = ns.notification_id
left join notification_handler nh on n.id = nh.notification_id
where n.payload_type = 'notification/card'
and ns.type = 'notification-subscription/cron';
