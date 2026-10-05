DROP VIEW IF EXISTS v_api_key_usage;

CREATE OR REPLACE VIEW v_api_key_usage AS
SELECT
    t.id                                                   AS log_id,
    t.occurred_at,
    t.route_template,
    t.http_method,
    t.status,
    t.duration_ms,
    t.api_key_id                                           AS api_key_id,
    ak.name                                                AS api_key_name,
    -- actor: who/what authenticated the request (the key's own synthetic service-account user).
    t.user_id                                              AS actor_user_id,
    -- creator: the real human who made the key — a different person from the actor above.
    t.created_by_id                                        AS creator_id,
    COALESCE(creator.first_name || ' ' || creator.last_name, creator.email) AS creator_display_name,
    -- the key's own group (via its synthetic user ak.user_id), not the creator's — a key has
    -- exactly one group, but its creator may belong to several.
    (SELECT pg.name
     FROM permissions_group_membership pgm
     JOIN permissions_group pg ON pg.id = pgm.group_id
     WHERE pgm.user_id = ak.user_id
       AND pg.id != 1
     ORDER BY pg.name
     LIMIT 1)                                              AS group_name,
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
    t.embedding_hostname                                   AS embedding_hostname,
    t.ip_address                                           AS ip_address,
    t.user_agent                                           AS user_agent
FROM api_key_usage_log t
LEFT JOIN api_key ak
    ON ak.id = t.api_key_id
LEFT JOIN core_user creator
    ON creator.id = t.created_by_id;
