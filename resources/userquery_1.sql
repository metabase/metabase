-- ============================================
-- USER PROFILE QUERY
-- ============================================
-- This query gathers user-specific context
-- Run this for each individual user
-- Replace ? with the actual user ID in parameterized query

-- PART 1: USER BASIC INFO
-- Core user profile information
SELECT 
    'USER_INFO' as section,
    json_build_object(
        'user_id', u.id,
        'first_name', u.first_name,
        'last_name', u.last_name,
        'full_name', CONCAT(u.first_name, ' ', u.last_name),
        'email', u.email,
        'locale', u.locale,
        'is_superuser', u.is_superuser,
        'is_active', u.is_active,
        'date_joined', u.date_joined,
        'last_login', u.last_login,
        'user_type', u.type,
        'settings', u.settings
    ) as data
FROM core_user u
WHERE u.id = ?

UNION ALL

-- PART 2: USER PERMISSIONS & GROUPS
-- What groups the user belongs to
SELECT 
    'USER_GROUPS' as section,
    COALESCE(
        json_agg(
            json_build_object(
                'group_id', pg.id,
                'group_name', pg.name,
                'group_type', pg.magic_group_type,
                'is_tenant_group', pg.is_tenant_group
            )
        ),
        '[]'::json
    ) as data
FROM permissions_group_membership pgm
JOIN permissions_group pg ON pgm.group_id = pg.id
WHERE pgm.user_id = ?

UNION ALL

-- PART 3: RECENTLY VIEWED ITEMS
-- What the user has been looking at (last 30 days)
SELECT 
    'RECENT_VIEWS' as section,
    COALESCE(
        (SELECT json_agg(view_data ORDER BY view_timestamp DESC)
         FROM (
             SELECT 
                 json_build_object(
                     'model_type', rv.model,
                     'model_id', rv.model_id,
                     'timestamp', rv.timestamp,
                     'context', rv.context,
                     'item_name', CASE 
                         WHEN rv.model = 'dashboard' THEN rd.name
                         WHEN rv.model = 'card' THEN rc.name
                         WHEN rv.model = 'table' THEN mt.display_name
                         ELSE NULL
                     END,
                     'item_description', CASE 
                         WHEN rv.model = 'dashboard' THEN rd.description
                         WHEN rv.model = 'card' THEN rc.description
                         WHEN rv.model = 'table' THEN mt.description
                         ELSE NULL
                     END
                 ) as view_data,
                 rv.timestamp as view_timestamp
             FROM recent_views rv
             LEFT JOIN report_dashboard rd ON rv.model = 'dashboard' AND rv.model_id = rd.id
             LEFT JOIN report_card rc ON rv.model = 'card' AND rv.model_id = rc.id
             LEFT JOIN metabase_table mt ON rv.model = 'table' AND rv.model_id = mt.id
             WHERE rv.user_id = ?
               AND rv.timestamp > NOW() - INTERVAL '30 days'
             LIMIT 50
         ) subquery),
        '[]'::json
    ) as data

UNION ALL

-- PART 4: FAVORITE DASHBOARDS
-- User's bookmarked dashboards
SELECT 
    'FAVORITE_DASHBOARDS' as section,
    COALESCE(
        json_agg(
            json_build_object(
                'dashboard_id', df.dashboard_id,
                'dashboard_name', rd.name,
                'description', rd.description,
                'collection_id', rd.collection_id,
                'collection_name', c.name
            )
        ),
        '[]'::json
    ) as data
FROM dashboard_favorite df
JOIN report_dashboard rd ON df.dashboard_id = rd.id
LEFT JOIN collection c ON rd.collection_id = c.id
WHERE df.user_id = ?
  AND rd.archived = false

UNION ALL

-- PART 5: FAVORITE CARDS/QUESTIONS
-- User's saved/favorite questions
SELECT 
    'FAVORITE_CARDS' as section,
    COALESCE(
        json_agg(
            json_build_object(
                'card_id', rcf.card_id,
                'card_name', rc.name,
                'description', rc.description,
                'query_type', rc.query_type,
                'database_id', rc.database_id,
                'collection_id', rc.collection_id,
                'collection_name', c.name
            )
        ),
        '[]'::json
    ) as data
FROM report_cardfavorite rcf
JOIN report_card rc ON rcf.card_id = rc.id
LEFT JOIN collection c ON rc.collection_id = c.id
WHERE rcf.owner_id = ?
  AND rc.archived = false

UNION ALL

-- PART 6: PERSONAL COLLECTIONS
-- User's personal collections
SELECT 
    'PERSONAL_COLLECTIONS' as section,
    COALESCE(
        json_agg(
            json_build_object(
                'collection_id', c.id,
                'collection_name', c.name,
                'description', c.description,
                'slug', c.slug
            )
        ),
        '[]'::json
    ) as data
FROM collection c
WHERE c.personal_owner_id = ?
  AND c.archived = false

UNION ALL

-- PART 7: BOOKMARKED COLLECTIONS
-- Collections the user has bookmarked
SELECT 
    'BOOKMARKED_COLLECTIONS' as section,
    COALESCE(
        json_agg(
            json_build_object(
                'collection_id', cb.collection_id,
                'collection_name', c.name,
                'description', c.description
            )
        ),
        '[]'::json
    ) as data
FROM collection_bookmark cb
JOIN collection c ON cb.collection_id = c.id
WHERE cb.user_id = ?
  AND c.archived = false

UNION ALL

-- PART 8: FREQUENTLY USED TABLES
-- Tables the user queries most often (last 90 days)
SELECT 
    'FREQUENTLY_USED_TABLES' as section,
    COALESCE(
        (SELECT json_agg(table_data ORDER BY usage_count DESC)
         FROM (
             SELECT 
                 json_build_object(
                     'table_id', mt.id,
                     'table_name', mt.name,
                     'display_name', mt.display_name,
                     'database_id', mt.db_id,
                     'database_name', md.name,
                     'schema', mt.schema,
                     'description', mt.description,
                     'usage_count', fu.usage_count
                 ) as table_data,
                 fu.usage_count
             FROM (
                 SELECT qt.table_id, COUNT(*) as usage_count
                 FROM query_execution qe
                 JOIN query_table qt ON qe.card_id = qt.card_id
                 WHERE qe.executor_id = ?
                   AND qe.started_at > NOW() - INTERVAL '90 days'
                   AND qt.table_id IS NOT NULL
                 GROUP BY qt.table_id
                 ORDER BY COUNT(*) DESC
                 LIMIT 20
             ) fu
             JOIN metabase_table mt ON fu.table_id = mt.id
             JOIN metabase_database md ON mt.db_id = md.id
         ) subquery),
        '[]'::json
    ) as data

UNION ALL

-- PART 9: FREQUENTLY USED FIELDS
-- Fields the user works with most often
SELECT 
    'FREQUENTLY_USED_FIELDS' as section,
    COALESCE(
        (SELECT json_agg(field_data ORDER BY usage_count DESC)
         FROM (
             SELECT 
                 json_build_object(
                     'field_id', mf.id,
                     'field_name', mf.name,
                     'display_name', mf.display_name,
                     'description', mf.description,
                     'base_type', mf.base_type,
                     'semantic_type', mf.semantic_type,
                     'table_id', mf.table_id,
                     'table_name', mt.name,
                     'database_name', md.name,
                     'usage_count', fu.usage_count
                 ) as field_data,
                 fu.usage_count
             FROM (
                 SELECT qf.field_id, COUNT(*) as usage_count
                 FROM query_execution qe
                 JOIN query_field qf ON qe.card_id = qf.card_id
                 WHERE qe.executor_id = ?
                   AND qe.started_at > NOW() - INTERVAL '90 days'
                   AND qf.field_id IS NOT NULL
                 GROUP BY qf.field_id
                 ORDER BY COUNT(*) DESC
                 LIMIT 30
             ) fu
             JOIN metabase_field mf ON fu.field_id = mf.id
             JOIN metabase_table mt ON mf.table_id = mt.id
             JOIN metabase_database md ON mt.db_id = md.id
         ) subquery),
        '[]'::json
    ) as data

UNION ALL

-- PART 10: RECENT QUERY EXECUTION STATS
-- User's query patterns and performance
SELECT 
    'QUERY_STATS' as section,
    COALESCE(
        (SELECT json_build_object(
            'total_queries_7d', COUNT(*),
            'avg_execution_time_ms', AVG(qe.running_time)::integer,
            'total_rows_returned', SUM(qe.result_rows),
            'databases_used', COUNT(DISTINCT qe.database_id),
            'unique_queries', COUNT(DISTINCT qe.hash)
        )
         FROM query_execution qe
         WHERE qe.executor_id = ?
           AND qe.started_at > NOW() - INTERVAL '7 days'),
        '{}'::json
    ) as data

UNION ALL

-- PART 11: RECENT QUERY HISTORY
-- Detailed recent query history
SELECT 
    'RECENT_QUERY_HISTORY' as section,
    COALESCE(
        (SELECT json_agg(query_data ORDER BY executed_at DESC)
         FROM (
             SELECT 
                 json_build_object(
                     'executed_at', qe.started_at,
                     'running_time_ms', qe.running_time,
                     'result_rows', qe.result_rows,
                     'database_id', qe.database_id,
                     'database_name', md.name,
                     'card_id', qe.card_id,
                     'card_name', rc.name,
                     'context', qe.context
                 ) as query_data,
                 qe.started_at as executed_at
             FROM query_execution qe
             LEFT JOIN metabase_database md ON qe.database_id = md.id
             LEFT JOIN report_card rc ON qe.card_id = rc.id
             WHERE qe.executor_id = ?
               AND qe.started_at > NOW() - INTERVAL '7 days'
             ORDER BY qe.started_at DESC
             LIMIT 100
         ) subquery),
        '[]'::json
    ) as data

UNION ALL

-- PART 12: USER PARAMETER VALUES
-- User's saved parameter preferences
SELECT 
    'USER_PARAMETERS' as section,
    COALESCE(
        json_agg(
            json_build_object(
                'parameter_id', upv.parameter_id,
                'value', upv.value
            )
        ),
        '[]'::json
    ) as data
FROM user_parameter_value upv
WHERE upv.user_id = ?

UNION ALL

-- PART 13: USER KEY-VALUE SETTINGS
-- Custom user preferences and settings
SELECT 
    'USER_PREFERENCES' as section,
    COALESCE(
        json_object_agg(ukv.key, ukv.value),
        '{}'::json
    ) as data
FROM user_key_value ukv
WHERE ukv.user_id = ?

UNION ALL

-- PART 14: DATABASES USER HAS ACCESSED
-- List of databases this user has permission to and uses
SELECT 
    'ACCESSIBLE_DATABASES' as section,
    COALESCE(
        (SELECT json_agg(db_data ORDER BY query_count DESC)
         FROM (
             SELECT 
                 json_build_object(
                     'database_id', md.id,
                     'database_name', md.name,
                     'description', md.description,
                     'engine', md.engine,
                     'last_accessed', db_usage.last_accessed,
                     'query_count', COALESCE(db_usage.query_count, 0)
                 ) as db_data,
                 COALESCE(db_usage.query_count, 0) as query_count
             FROM metabase_database md
             LEFT JOIN (
                 SELECT 
                     database_id,
                     MAX(started_at) as last_accessed,
                     COUNT(*) as query_count
                 FROM query_execution
                 WHERE executor_id = ?
                   AND started_at > NOW() - INTERVAL '90 days'
                 GROUP BY database_id
             ) db_usage ON md.id = db_usage.database_id
             WHERE md.is_sample = false
         ) subquery),
        '[]'::json
    ) as data

UNION ALL

-- PART 15: CREATED CONTENT
-- Dashboards and cards created by this user
SELECT 
    'CREATED_CONTENT' as section,
    json_build_object(
        'dashboards_created', (
            SELECT COUNT(*) 
            FROM report_dashboard 
            WHERE creator_id = ? AND archived = false
        ),
        'cards_created', (
            SELECT COUNT(*) 
            FROM report_card 
            WHERE creator_id = ? AND archived = false
        ),
        'collections_created', (
            SELECT COUNT(*) 
            FROM collection 
            WHERE personal_owner_id = ? AND archived = false
        )
    ) as data;