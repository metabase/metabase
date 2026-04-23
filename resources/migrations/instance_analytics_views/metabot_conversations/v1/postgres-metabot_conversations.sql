DROP VIEW IF EXISTS v_metabot_conversations;

CREATE OR REPLACE VIEW v_metabot_conversations AS
SELECT
    c.id                                                              AS conversation_id,
    c.created_at,
    c.user_id,
    c.summary,
    COALESCE(u.first_name || ' ' || u.last_name, u.email)            AS user_display_name,
    COUNT(m.id)                                                       AS message_count,
    COUNT(CASE WHEN m.role = 'user' THEN 1 END)                       AS user_message_count,
    COUNT(CASE WHEN m.role = 'assistant' THEN 1 END)                  AS assistant_message_count,
    COALESCE(MAX(a.total_tokens), 0)                                  AS total_tokens,
    COALESCE(MAX(a.prompt_tokens), 0)                                 AS prompt_tokens,
    COALESCE(MAX(a.completion_tokens), 0)                             AS completion_tokens,
    MAX(m.created_at)                                                 AS last_message_at,
    (SELECT mm.profile_id
     FROM metabot_message mm
     WHERE mm.conversation_id = c.id
       AND mm.role = 'assistant'
       AND mm.deleted_at IS NULL
     ORDER BY mm.created_at
     LIMIT 1)                                                         AS profile_id,
    (SELECT pg.name
     FROM permissions_group_membership pgm
     JOIN permissions_group pg ON pg.id = pgm.group_id
     WHERE pgm.user_id = c.user_id
       AND pg.id != 1
     ORDER BY pg.name
     LIMIT 1)                                                         AS group_name,
    (SELECT aul.source
     FROM ai_usage_log aul
     WHERE aul.conversation_id = c.id
     ORDER BY aul.created_at
     LIMIT 1)                                                         AS source,
    c.ip_address                                                      AS ip_address,
    MAX(a.tenant_id)                                                  AS tenant_id,
    MAX(t.name)                                                       AS tenant_name,
    (SELECT aul.model
     FROM ai_usage_log aul
     WHERE aul.conversation_id = c.id
     ORDER BY aul.created_at
     LIMIT 1)                                                         AS model
FROM metabot_conversation c
LEFT JOIN core_user u
    ON u.id = c.user_id
LEFT JOIN metabot_message m
    ON m.conversation_id = c.id
   AND m.deleted_at IS NULL
LEFT JOIN (
    SELECT
        conversation_id,
        COALESCE(SUM(prompt_tokens), 0)     AS prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
        COALESCE(SUM(total_tokens), 0)      AS total_tokens,
        MIN(tenant_id)                       AS tenant_id
    FROM ai_usage_log
    WHERE conversation_id IS NOT NULL
    GROUP BY conversation_id
) a ON a.conversation_id = c.id
LEFT JOIN tenant t ON t.id = a.tenant_id
GROUP BY c.id, c.created_at, c.user_id, c.summary, u.first_name, u.last_name, u.email;
