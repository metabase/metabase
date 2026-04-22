DROP VIEW IF EXISTS v_ai_usage_log;

CREATE OR REPLACE VIEW v_ai_usage_log AS
SELECT
    a.id                                                              AS usage_log_id,
    a.created_at,
    a.source,
    a.model,
    a.profile_id,
    a.prompt_tokens,
    a.completion_tokens,
    a.total_tokens,
    a.conversation_id,
    a.user_id,
    'user_' || a.user_id                                              AS user_qualified_id,
    COALESCE(u.first_name || ' ' || u.last_name, u.email)             AS user_display_name,
    (SELECT pg.name
     FROM permissions_group_membership pgm
     JOIN permissions_group pg ON pg.id = pgm.group_id
     WHERE pgm.user_id = a.user_id
       AND pg.id != 1
     ORDER BY pg.name
     LIMIT 1)                                                         AS group_name,
    c.ip_address                                                      AS ip_address,
    a.tenant_id,
    a.request_id
FROM ai_usage_log a
LEFT JOIN core_user u
    ON u.id = a.user_id
LEFT JOIN metabot_conversation c
    ON c.id = a.conversation_id;
