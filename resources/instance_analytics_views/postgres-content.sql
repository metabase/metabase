create or replace view v_content as
select
    concat('action_', id) as id,
    'action' as entity_type,
    created_at,
    updated_at,
    creator_id,
    name,
    description,
    cast(null as int) as collection_id,
    made_public_by_id as made_public_by_user,
    cast(null as boolean) as is_embedding_enabled,
    archived,
    type as action_type,
    model_id as action_model_id,
    null as collection_is_official,
    null as collection_is_personal,
    null as question_viz_type,
    null as question_database_id,
    cast(null as boolean) as question_is_native,
    cast(null as timestamp) as event_timestamp
    from action
union
select
    concat('collection_', id) as id,
    'collection' as entity_type,
    created_at,
    null as updated_at,
    null as creator_id,
    name,
    description,
    null as collection_id,
    null as made_public_by_user,
    null as is_embedding_enabled,
    archived,
    null as action_type,
    null as action_model_id,
    case when authority_level='official' then true else false end as collection_is_official,
    case when personal_owner_id is not null then true else false end as collection_is_personal,
    null as question_viz_type,
    null as question_database_id,
    null as question_is_native,
    null as event_timestamp
    from collection
union
select
    concat(
        case when dataset
            then 'model_'
            else 'question_'
        end, id) as id,
    case when dataset then 'model' else 'question' end as entity_type,
    created_at,
    updated_at,
    creator_id,
    name,
    description,
    collection_id as collection_id,
    made_public_by_id as made_public_by_user,
    enable_embedding as is_embedding_enabled,
    archived,
    null as action_type,
    null as action_model_id,
    null as collection_is_official,
    null as collection_is_personal,
    display as question_viz_type,
    concat('database_', database_id) as question_database_id,
    case when query_type='native' then true else false end as question_is_native,
    null as event_timestamp
    from report_card
union
select
    concat('dashboard_', id) as id,
    'dashboard' as entity_type,
    created_at,
    updated_at,
    creator_id,
    name,
    description,
    collection_id as collection_id,
    made_public_by_id as made_public_by_user,
    enable_embedding as is_embedding_enabled,
    archived,
    null as action_type,
    null as action_model_id,
    null as collection_is_official,
    null as collection_is_personal,
    null as question_viz_type,
    null as question_database_id,
    null as question_is_native,
    null as event_timestamp
    from report_dashboard
union
select
    concat('event_', event.id) as id,
    'event' as entity_type,
    event.created_at,
    event.updated_at,
    event.creator_id,
    event.name,
    event.description,
    timeline.collection_id,
    null as made_public_by_user,
    null as is_embedding_enabled,
    event.archived,
    null as action_type,
    null as action_model_id,
    null as collection_is_official,
    null as collection_is_personal,
    null as question_viz_type,
    null as question_database_id,
    null as question_is_native,
    timestamp as event_timestamp
    from timeline_event event
        left join timeline on event.timeline_id = timeline.id
