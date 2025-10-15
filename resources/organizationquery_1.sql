-- ============================================
-- ORGANIZATION PROFILE QUERY
-- ============================================
-- This query gathers organization-wide context that is shared across all users
-- Run this once to generate the company profile
-- No parameters needed

-- PART 1: COMPANY SETTINGS
-- Basic organization configuration and branding
SELECT 
    'COMPANY_SETTINGS' as section,
    COALESCE(json_object_agg(s.key, s.value), '{}'::json) as data
FROM setting s
WHERE s.key IN (
    'site-name',
    'site-locale',
    'report-timezone',
    'custom-formatting',
    'application-name',
    'admin-email',
    'site-url'
)

UNION ALL

-- PART 2: ALL DATABASES
-- Complete list of data sources in the organization
SELECT 
    'DATABASES' as section,
    COALESCE(
        json_agg(
            json_build_object(
                'database_id', md.id,
                'database_name', md.name,
                'description', md.description,
                'engine', md.engine,
                'is_sample', md.is_sample,
                'created_at', md.created_at,
                'timezone', md.timezone
            ) ORDER BY md.name
        ),
        '[]'::json
    ) as data
FROM metabase_database md
WHERE md.is_sample = false

UNION ALL

-- PART 3: ALL TABLES
-- Comprehensive table catalog with metadata
SELECT 
    'TABLES' as section,
    COALESCE(
        json_agg(
            json_build_object(
                'table_id', mt.id,
                'table_name', mt.name,
                'display_name', mt.display_name,
                'database_id', mt.db_id,
                'database_name', md.name,
                'schema', mt.schema,
                'description', mt.description,
                'entity_type', mt.entity_type,
                'active', mt.active
            ) ORDER BY md.name, mt.schema, mt.name
        ),
        '[]'::json
    ) as data
FROM metabase_table mt
JOIN metabase_database md ON mt.db_id = md.id
WHERE mt.active = true
  AND md.is_sample = false

UNION ALL

-- PART 4: ALL METRICS
-- Organization-wide business metrics
SELECT 
    'METRICS' as section,
    COALESCE(
        json_agg(
            json_build_object(
                'metric_id', m.id,
                'metric_name', m.name,
                'description', m.description,
                'table_id', m.table_id,
                'table_name', mt.name,
                'database_id', md.id,
                'database_name', md.name,
                'definition', m.definition,
                'created_at', m.created_at
            ) ORDER BY m.name
        ),
        '[]'::json
    ) as data
FROM metric m
JOIN metabase_table mt ON m.table_id = mt.id
JOIN metabase_database md ON mt.db_id = md.id
WHERE m.archived = false

UNION ALL

-- PART 5: ALL SEGMENTS
-- Pre-defined data filters
SELECT 
    'SEGMENTS' as section,
    COALESCE(
        json_agg(
            json_build_object(
                'segment_id', s.id,
                'segment_name', s.name,
                'description', s.description,
                'table_id', s.table_id,
                'table_name', mt.name,
                'database_id', md.id,
                'database_name', md.name,
                'definition', s.definition
            ) ORDER BY s.name
        ),
        '[]'::json
    ) as data
FROM segment s
JOIN metabase_table mt ON s.table_id = mt.id
JOIN metabase_database md ON mt.db_id = md.id
WHERE s.archived = false

UNION ALL

-- PART 6: BUSINESS GLOSSARY
-- Company-wide terminology and definitions
SELECT 
    'GLOSSARY' as section,
    COALESCE(
        json_agg(
            json_build_object(
                'term_id', g.id,
                'term', g.term,
                'definition', g.definition
            ) ORDER BY g.term
        ),
        '[]'::json
    ) as data
FROM glossary g

UNION ALL

-- PART 7: PUBLIC COLLECTIONS
-- Shared content spaces available to all users
SELECT 
    'PUBLIC_COLLECTIONS' as section,
    COALESCE(
        json_agg(
            json_build_object(
                'collection_id', c.id,
                'collection_name', c.name,
                'description', c.description,
                'slug', c.slug,
                'namespace', c.namespace
            ) ORDER BY c.name
        ),
        '[]'::json
    ) as data
FROM collection c
WHERE c.archived = false
  AND c.personal_owner_id IS NULL
  AND c.location = '/'

UNION ALL

-- PART 8: POPULAR DASHBOARDS
-- Most viewed dashboards across the organization
SELECT 
    'POPULAR_DASHBOARDS' as section,
    COALESCE(
        (SELECT json_agg(dashboard_data ORDER BY view_count DESC)
         FROM (
             SELECT 
                 json_build_object(
                     'dashboard_id', rd.id,
                     'dashboard_name', rd.name,
                     'description', rd.description,
                     'collection_id', rd.collection_id,
                     'collection_name', c.name,
                     'view_count', COALESCE(view_stats.view_count, 0),
                     'created_at', rd.created_at
                 ) as dashboard_data,
                 COALESCE(view_stats.view_count, 0) as view_count
             FROM report_dashboard rd
             LEFT JOIN collection c ON rd.collection_id = c.id
             LEFT JOIN (
                 SELECT model_id, COUNT(*) as view_count
                 FROM recent_views
                 WHERE model = 'dashboard'
                   AND timestamp > NOW() - INTERVAL '90 days'
                 GROUP BY model_id
             ) view_stats ON rd.id = view_stats.model_id
             WHERE rd.archived = false
             LIMIT 20
         ) subquery),
        '[]'::json
    ) as data

UNION ALL

-- PART 9: POPULAR QUESTIONS/CARDS
-- Most used queries across the organization
SELECT 
    'POPULAR_QUESTIONS' as section,
    COALESCE(
        (SELECT json_agg(question_data ORDER BY view_count DESC)
         FROM (
             SELECT 
                 json_build_object(
                     'card_id', rc.id,
                     'card_name', rc.name,
                     'description', rc.description,
                     'query_type', rc.query_type,
                     'database_id', rc.database_id,
                     'database_name', md.name,
                     'collection_id', rc.collection_id,
                     'collection_name', c.name,
                     'view_count', COALESCE(view_stats.view_count, 0)
                 ) as question_data,
                 COALESCE(view_stats.view_count, 0) as view_count
             FROM report_card rc
             LEFT JOIN collection c ON rc.collection_id = c.id
             LEFT JOIN metabase_database md ON rc.database_id = md.id
             LEFT JOIN (
                 SELECT model_id, COUNT(*) as view_count
                 FROM recent_views
                 WHERE model = 'card'
                   AND timestamp > NOW() - INTERVAL '90 days'
                 GROUP BY model_id
             ) view_stats ON rc.id = view_stats.model_id
             WHERE rc.archived = false
               AND rc.query_type IS NOT NULL
             LIMIT 20
         ) subquery),
        '[]'::json
    ) as data

UNION ALL

-- PART 10: DIMENSIONS
-- Custom field configurations and groupings
SELECT 
    'DIMENSIONS' as section,
    COALESCE(
        json_agg(
            json_build_object(
                'dimension_id', d.id,
                'dimension_name', d.name,
                'field_id', d.field_id,
                'human_readable_field_id', d.human_readable_field_id,
                'type', d.type
            )
        ),
        '[]'::json
    ) as data
FROM dimension d

UNION ALL

-- PART 11: COMMON FIELD TYPES
-- Most frequently used fields for understanding data structure
SELECT 
    'COMMON_FIELDS' as section,
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
                     'database_id', md.id,
                     'database_name', md.name,
                     'usage_count', fu.usage_count
                 ) as field_data,
                 fu.usage_count
             FROM (
                 SELECT fu.field_id, COUNT(*) as usage_count
                 FROM field_usage fu
                 JOIN query_execution qe ON fu.query_execution_id = qe.id
                 WHERE qe.started_at > NOW() - INTERVAL '90 days'
                 GROUP BY fu.field_id
                 ORDER BY COUNT(*) DESC
                 LIMIT 50
             ) fu
             JOIN metabase_field mf ON fu.field_id = mf.id
             JOIN metabase_table mt ON mf.table_id = mt.id
             JOIN metabase_database md ON mt.db_id = md.id
         ) subquery),
        '[]'::json
    ) as data

UNION ALL

-- PART 12: PERMISSIONS GROUPS
-- Available permission groups for understanding access levels
SELECT 
    'PERMISSION_GROUPS' as section,
    COALESCE(
        json_agg(
            json_build_object(
                'group_id', pg.id,
                'group_name', pg.name,
                'group_type', pg.magic_group_type,
                'is_tenant_group', pg.is_tenant_group
            ) ORDER BY pg.name
        ),
        '[]'::json
    ) as data
FROM permissions_group pg

UNION ALL

-- PART 13: NATIVE QUERY SNIPPETS
-- Reusable SQL snippets available to all users
SELECT 
    'QUERY_SNIPPETS' as section,
    COALESCE(
        json_agg(
            json_build_object(
                'snippet_id', nqs.id,
                'snippet_name', nqs.name,
                'description', nqs.description,
                'content', nqs.content,
                'created_at', nqs.created_at
            ) ORDER BY nqs.name
        ),
        '[]'::json
    ) as data
FROM native_query_snippet nqs
WHERE nqs.archived = false;