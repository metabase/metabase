DROP VIEW IF EXISTS v_api_key_usage;

CREATE OR REPLACE VIEW v_api_key_usage AS
SELECT
    t.id                                                   AS log_id,
    t.created_at,
    t.route_template,
    t.http_method,
    t.status,
    t.duration_ms,
    t.api_key_id                                           AS api_key_id,
    ak.name                                                AS api_key_name,
    t.user_id,
    COALESCE(u.first_name || ' ' || u.last_name, u.email)  AS user_display_name,
    (SELECT pg.name
     FROM permissions_group_membership pgm
     JOIN permissions_group pg ON pg.id = pgm.group_id
     WHERE pgm.user_id = t.user_id
       AND pg.id != 1
     ORDER BY pg.name
     LIMIT 1)                                              AS group_name,
    t.tenant_id                                            AS tenant_id,
    tn.name                                                AS tenant_name,
    t.client_name                                          AS client_name,
    -- NOTE: keep these CASE branches in sync with `supported-client-keys` /
    -- `detect-client` in src/metabase/api_keys/usage.clj (the enum-<->-CASE sync footgun).
    CASE t.client_name
        WHEN 'metabase-cli'    THEN 'Metabase CLI'
        WHEN 'curl'            THEN 'curl'
        WHEN 'postman'         THEN 'Postman'
        WHEN 'python-requests' THEN 'Python'
        WHEN 'r'               THEN 'R'
        WHEN 'node'            THEN 'Node.js'
        WHEN 'other'           THEN 'Other'
        ELSE t.client_name
    END                                                    AS client_display_name,
    t.embedding_client                                     AS embedding_client,
    t.ip_address                                           AS ip_address,
    t.user_agent                                           AS user_agent
FROM api_key_usage_log t
LEFT JOIN api_key ak
    ON ak.id = t.api_key_id
LEFT JOIN core_user u
    ON u.id = t.user_id
LEFT JOIN tenant tn
    ON tn.id = t.tenant_id;
