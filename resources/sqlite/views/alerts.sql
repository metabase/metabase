-- SQLite equivalent of instance_analytics_views/alerts/v4/h2-alerts.sql.
create view v_alerts as
with cron_fields as (
    select ns.*,
           json_extract('["' || replace(cron_schedule, ' ', '","') || '"]', '$[1]') as cron_minute,
           json_extract('["' || replace(cron_schedule, ' ', '","') || '"]', '$[2]') as cron_hour,
           json_extract('["' || replace(cron_schedule, ' ', '","') || '"]', '$[3]') as cron_monthday,
           json_extract('["' || replace(cron_schedule, ' ', '","') || '"]', '$[5]') as cron_weekday
    from notification_subscription ns
)
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
        when ns.ui_display_type = 'cron/raw' then 'custom'
        when ns.cron_minute = '*' or
             (ns.cron_minute GLOB '[0-9]*/[0-9]*' and ns.cron_minute not glob '*[^0-9/]*' and length(ns.cron_minute) - length(replace(ns.cron_minute, '/', '')) = 1) then 'by the minute'
        when ns.cron_monthday != '*' and
             (ns.cron_weekday = '?' or
              ns.cron_weekday GLOB '[0-9]#1' or
              ns.cron_weekday GLOB '[0-9]L') then 'monthly'
        when ns.cron_weekday != '?' and
             ns.cron_weekday != '*' then 'weekly'
        when ns.cron_hour != '*' then 'daily'
        else 'hourly'
    end as schedule_type,
    case
        when ns.cron_weekday GLOB '1*' then 'sun'
        when ns.cron_weekday GLOB '2*' then 'mon'
        when ns.cron_weekday GLOB '3*' then 'tue'
        when ns.cron_weekday GLOB '4*' then 'wed'
        when ns.cron_weekday GLOB '5*' then 'thu'
        when ns.cron_weekday GLOB '6*' then 'fri'
        when ns.cron_weekday GLOB '7*' then 'sat'
        else null
    end as schedule_day,
    case
        when ns.cron_hour = '*' then null
        when (ns.cron_hour != '' and ns.cron_hour NOT GLOB '*[^0-9]*') then
            cast(ns.cron_hour as integer)
        when (ns.cron_hour GLOB '[0-9]*/[0-9]*' and ns.cron_hour not glob '*[^0-9/]*' and length(ns.cron_hour) - length(replace(ns.cron_hour, '/', '')) = 1) then
            cast(substr(ns.cron_hour, 1, instr(ns.cron_hour, '/') - 1) as integer)
        else null
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
join cron_fields ns on n.id = ns.notification_id
left join notification_handler nh on n.id = nh.notification_id
where n.payload_type = 'notification/card'
and ns.type = 'notification-subscription/cron';
