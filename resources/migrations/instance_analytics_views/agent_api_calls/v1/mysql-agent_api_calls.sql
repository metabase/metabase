DROP VIEW IF EXISTS v_agent_api_calls;

CREATE OR REPLACE VIEW v_agent_api_calls AS
SELECT
    t.id                                                       AS call_id,
    t.created_at,
    t.operation,
    t.status,
    t.error_message                                            AS error_message,
    t.duration_ms,
    t.user_id,
    COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.email)  AS user_display_name,
    (SELECT pg.name
     FROM permissions_group_membership pgm
     JOIN permissions_group pg ON pg.id = pgm.group_id
     WHERE pgm.user_id = t.user_id
       AND pg.id != 1
     ORDER BY pg.name
     LIMIT 1)                                                  AS group_name,
    t.client_name                                              AS client_name,
    -- NOTE: keep these CASE branches in sync with `supported-client-keys` /
    -- `detect-client` in src/metabase/agent_api/usage.clj (the enum-<->-CASE sync footgun).
    CASE t.client_name
        WHEN 'metabase-cli' THEN 'Metabase CLI'
        WHEN 'other'        THEN 'Other'
        ELSE t.client_name
    END                                                        AS client_display_name,
    t.tenant_id                                                AS tenant_id,
    tn.name                                                    AS tenant_name,
    t.ip_address                                               AS ip_address
FROM agent_api_call_log t
LEFT JOIN core_user u
    ON u.id = t.user_id
LEFT JOIN tenant tn
    ON tn.id = t.tenant_id;
