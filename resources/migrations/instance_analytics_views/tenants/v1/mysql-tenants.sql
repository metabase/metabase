CREATE OR REPLACE
SQL SECURITY INVOKER
VIEW v_tenants AS
SELECT id AS tenant_id,
       concat('tenant_', id) AS entity_qualified_id,
       name,
       slug,
       is_active,
       attributes,
       created_at,
       updated_at,
       tenant_collection_id,
       concat('collection_', tenant_collection_id) AS tenant_collection_qualified_id
FROM tenant;
