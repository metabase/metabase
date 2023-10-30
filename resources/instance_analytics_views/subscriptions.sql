create or replace view v_alerts_subscriptions as
with agg_recipients as (
    select
        pulse_channel_id,
        string_agg(core_user.email,',') as recipients
    from pulse_channel_recipient
        left join core_user on pulse_channel_recipient.user_id = core_user.id
    group by 1
)
select
    pulse.id as entity_id,
    concat(
        case when dashboard_id is not null
            then 'subscription_'
            else 'alert_'
        end, pulse.id) as entity_qualified_id,
    case when dashboard_id is not null then 'subscription' else 'alert' end entity_type,
    pulse.created_at,
    pulse.updated_at as updated_at,
    creator_id as creator_id,
    name,
    collection_id as collection_id,
    archived,
    case when
        dashboard_id is not null then
        dashboard_id
        end as subscription_dashboard_id,
    case when card_id is not null then
        card_id
        end as alert_question_id,
    channel_type as recipient_type,
    agg_recipients.recipients,
    details as recipient_external
    from pulse
        left join pulse_card on pulse.id = pulse_card.pulse_id
        left join pulse_channel on pulse.id = pulse_channel.pulse_id
        left join agg_recipients on pulse_channel.id = agg_recipients.pulse_channel_id
    where pulse_card.dashboard_card_id is null
