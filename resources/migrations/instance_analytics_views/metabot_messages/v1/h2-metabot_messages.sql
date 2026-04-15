DROP VIEW IF EXISTS v_metabot_messages;

CREATE OR REPLACE VIEW v_metabot_messages AS
SELECT
    m.id                           AS message_id,
    m.conversation_id,
    m.created_at,
    m.role,
    m.profile_id                   AS profile,
    m.total_tokens,
    c.user_id,
    'user_' || c.user_id           AS user_qualified_id,
    m.slack_msg_id,
    m.channel_id
FROM metabot_message m
JOIN metabot_conversation c
    ON c.id = m.conversation_id
WHERE m.deleted_at IS NULL;
