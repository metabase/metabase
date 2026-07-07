DROP VIEW IF EXISTS v_mcp_tool_calls;

CREATE OR REPLACE VIEW v_mcp_tool_calls AS
SELECT
    t.id                                                       AS tool_call_id,
    t.created_at,
    t.tool_name,
    t.status,
    -- NOTE: keep these CASE branches in sync with the error-code-* constants in
    -- src/metabase/mcp/tools.clj (the enum-<->-CASE sync footgun).
    CASE t.error_code
        WHEN -32600 THEN 'Invalid request'
        WHEN -32601 THEN 'Method not found'
        WHEN -32602 THEN 'Invalid params'
        WHEN -32603 THEN 'Internal error'
        WHEN -32000 THEN 'Server error'
        ELSE NULL
    END                                                        AS error_type,
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
    -- `detect-client` in src/metabase/mcp/usage.clj (the enum-<->-CASE sync footgun).
    CASE t.client_name
        WHEN 'claude'        THEN 'Claude'
        WHEN 'chatgpt'       THEN 'ChatGPT'
        WHEN 'cursor-vscode' THEN 'Cursor'
        WHEN 'vscode'        THEN 'VS Code'
        WHEN 'zed'           THEN 'Zed'
        WHEN 'other'         THEN 'Other'
        ELSE t.client_name
    END                                                        AS client_display_name,
    t.client_version                                           AS client_version,
    t.tenant_id                                                AS tenant_id,
    tn.name                                                    AS tenant_name,
    t.ip_address                                               AS ip_address,
    t.user_agent                                               AS user_agent,
    t.sanitized_user_agent                                     AS sanitized_user_agent
FROM mcp_tool_call_log t
LEFT JOIN core_user u
    ON u.id = t.user_id
LEFT JOIN tenant tn
    ON tn.id = t.tenant_id;
