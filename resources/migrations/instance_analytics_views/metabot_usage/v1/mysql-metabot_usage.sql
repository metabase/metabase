DROP VIEW IF EXISTS v_metabot_usage;

CREATE OR REPLACE VIEW v_metabot_usage AS
SELECT
    DATE(m.created_at)                                            AS usage_date,
    m.profile_id,
    COUNT(DISTINCT c.id)                                          AS conversation_count,
    COUNT(DISTINCT COALESCE(m.user_id, c.user_id))                AS unique_users,
    COUNT(CASE WHEN m.role = 'user' THEN 1 END)                   AS user_messages,
    COUNT(CASE WHEN m.role = 'assistant' THEN 1 END)              AS assistant_messages,
    COALESCE(SUM(m.total_tokens), 0)                              AS total_tokens
FROM metabot_message m
JOIN metabot_conversation c
    ON c.id = m.conversation_id
WHERE m.deleted_at IS NULL
GROUP BY DATE(m.created_at), m.profile_id;
