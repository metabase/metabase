DROP VIEW IF EXISTS v_metabot_usage;

CREATE OR REPLACE VIEW v_metabot_usage AS
SELECT
    msg.usage_date,
    msg.model,
    msg.conversation_count,
    msg.unique_users,
    msg.user_messages,
    msg.assistant_messages,
    msg.total_tokens,
    COALESCE(costs.estimated_cost, 0)                                 AS estimated_cost
FROM (
    SELECT
        DATE(m.created_at)                                            AS usage_date,
        m.profile_id                                                  AS model,
        COUNT(DISTINCT c.id)                                          AS conversation_count,
        COUNT(DISTINCT c.user_id)                                     AS unique_users,
        COUNT(CASE WHEN m.role = 'user' THEN 1 END)                   AS user_messages,
        COUNT(CASE WHEN m.role = 'assistant' THEN 1 END)              AS assistant_messages,
        COALESCE(SUM(m.total_tokens), 0)                              AS total_tokens
    FROM metabot_message m
    JOIN metabot_conversation c
        ON c.id = m.conversation_id
    WHERE m.deleted_at IS NULL
    GROUP BY DATE(m.created_at), m.profile_id
) msg
LEFT JOIN (
    SELECT
        DATE(created_at)                                              AS cost_date,
        profile_id,
        SUM(estimated_cost_usd)                                       AS estimated_cost
    FROM ai_usage_log
    GROUP BY DATE(created_at), profile_id
) costs
    ON costs.cost_date = msg.usage_date
   AND costs.profile_id = msg.model;
