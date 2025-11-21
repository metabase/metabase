drop view if exists v_content;

create or replace
SQL SECURITY INVOKER
view v_content as
select
    action.id as entity_id,
    concat('action_', action.id) as entity_qualified_id,
    'action' as entity_type,
    created_at,
    updated_at,
    creator_id,
    name,
    description,
    null as collection_id,
    made_public_by_id as made_public_by_user,
    null as is_embedding_enabled,
    null as is_verified,
    archived,
    type as action_type,
    model_id as action_model_id,
    null as collection_is_official,
    null as collection_is_personal,
    null as question_viz_type,
    null as question_database_id,
    null as question_is_native,
    null as event_timestamp
    from action
union
select
    collection.id as entity_id,
    concat('collection_', collection.id) as entity_qualified_id,
    'collection' as entity_type,
    created_at,
    null as updated_at,
    null as creator_id,
    name,
    description,
    null as collection_id,
    null as made_public_by_user,
    null as is_embedding_enabled,
    null as is_verified,
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
    report_card.id as entity_id,
    concat('card_', report_card.id) as entity_qualified_id,
    type as entity_type,
    created_at,
    updated_at,
    creator_id,
    name,
    description,
    collection_id as collection_id,
    made_public_by_id as made_public_by_user,
    enable_embedding as is_embedding_enabled,
    case when is_verified then true else false end as is_verified,
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
        left join (
            select
                concat(moderated_item_type, '_', moderated_item_id) as entity_qualified_id,
                case when status = 'verified' then true else false end as is_verified
            from moderation_review
            where most_recent
        ) as moderation on concat('card_', report_card.id) = moderation.entity_qualified_id
union
select
    report_dashboard.id as entity_id,
    concat('dashboard_', report_dashboard.id) as entity_qualified_id,
    'dashboard' as entity_type,
    created_at,
    updated_at,
    creator_id,
    name,
    description,
    collection_id as collection_id,
    made_public_by_id as made_public_by_user,
    enable_embedding as is_embedding_enabled,
    case when is_verified then true else false end as is_verified,
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
        left join (
            select
                concat(moderated_item_type, '_', moderated_item_id) as entity_qualified_id,
                case when status = 'verified' then true else false end as is_verified
            from moderation_review
            where most_recent
        ) as moderation on concat('dashboard_', report_dashboard.id) = moderation.entity_qualified_id
union
select
    document.id as entity_id,
    concat('document_', document.id) as entity_qualified_id,
    'document' as entity_type,
    created_at,
    updated_at,
    creator_id,
    name,
    null as description,
    collection_id as collection_id,
    null as made_public_by_user,
    null as is_embedding_enabled,
    null as is_verified,
    archived,
    null as action_type,
    null as action_model_id,
    null as collection_is_official,
    null as collection_is_personal,
    null as question_viz_type,
    null as question_database_id,
    null as question_is_native,
    null as event_timestamp
    from document
union
select
    event.id as entity_id,
    concat('event_', event.id) as entity_qualified_id,
    'event' as entity_type,
    event.created_at,
    event.updated_at,
    event.creator_id,
    event.name,
    event.description,
    timeline.collection_id,
    null as made_public_by_user,
    null as is_embedding_enabled,
    null as is_verified,
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
union
select
    transform.id as entity_id,
    concat('transform_', transform.id) as entity_qualified_id,
    'transform' as entity_type,
    created_at,
    updated_at,
    creator_id,
    name,
    description,
    null as collection_id,
    null as made_public_by_user,
    null as is_embedding_enabled,
    null as is_verified,
    false as archived,
    null as action_type,
    null as action_model_id,
    null as collection_is_official,
    null as collection_is_personal,
    null as question_viz_type,
    null as question_database_id,
    null as question_is_native,
    null as event_timestamp
    from transform
union
select
    glossary.id as entity_id,
    concat('glossary_', glossary.id) as entity_qualified_id,
    'glossary' as entity_type,
    created_at,
    updated_at,
    creator_id,
    term as name,
    definition as description,
    null as collection_id,
    null as made_public_by_user,
    null as is_embedding_enabled,
    null as is_verified,
    false as archived,
    null as action_type,
    null as action_model_id,
    null as collection_is_official,
    null as collection_is_personal,
    null as question_viz_type,
    null as question_database_id,
    null as question_is_native,
    null as event_timestamp
    from glossary
