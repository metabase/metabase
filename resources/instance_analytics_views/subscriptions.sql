create or replace view v_alerts_subscriptions as
select
    concat(
        case when dashboard_id is not null
            then 'subscription_'
            else 'alert_'
        end, pulse.id) as id,
    case when dashboard_id is not null then 'subscription' else 'alert' end entity_type,
    pulse.created_at,
    pulse.updated_at as updated_at,
    creator_id as creator_id,
    name,
    null as description,
    concat('collection_', collection_id) as collection_id,
    null as made_public_by_user,
    archived,
    null as is_official,
    null as action_type,
    null as action_model_id,
    null as collection_is_personal,
    concat('dashboard_', dashboard_id) as subscription_dashboard_id,
    card_id as alert_question_id,
    channel_type as recipient_type,
    details as recipient_external
    from pulse
        left join pulse_card on pulse.id = pulse_card.pulse_id
        left join pulse_channel on pulse.id = pulse_channel.pulse_id
    where pulse_card.dashboard_card_id is null