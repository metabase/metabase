drop view if exists v_alerts;

create or replace view v_alerts as
with agg_recipients as (
    select
        pulse_channel_id,
        string_agg(core_user.email,',') as recipients
    from pulse_channel_recipient
        left join core_user on pulse_channel_recipient.user_id = core_user.id
    group by pulse_channel_id
)
select
    pulse.id as entity_id,
    'pulse_' || pulse.id as entity_qualified_id,
    pulse.created_at,
    pulse.updated_at,
    creator_id,
    card_id,
    'card_' || card_id as card_qualified_id,
    alert_condition,
    pulse_channel.schedule_type,
    pulse_channel.schedule_day,
    pulse_channel.schedule_hour,
    archived,
    channel_type as recipient_type,
    agg_recipients.recipients,
    details as recipient_external
    from pulse
        left join pulse_card on pulse.id = pulse_card.pulse_id
        left join pulse_channel on pulse.id = pulse_channel.pulse_id
        left join agg_recipients on pulse_channel.id = agg_recipients.pulse_channel_id
    where alert_condition is not null;
