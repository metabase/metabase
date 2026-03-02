-- Iceberg JDBC catalog metadata tables.
-- These must exist before Trino's Iceberg connector can use the catalog.

CREATE TABLE IF NOT EXISTS iceberg_tables (
  catalog_name             VARCHAR(255) NOT NULL,
  table_namespace          VARCHAR(255) NOT NULL,
  table_name               VARCHAR(255) NOT NULL,
  metadata_location        VARCHAR(1000),
  previous_metadata_location VARCHAR(1000),
  PRIMARY KEY (catalog_name, table_namespace, table_name)
);

CREATE TABLE IF NOT EXISTS iceberg_namespace_properties (
  catalog_name   VARCHAR(255)  NOT NULL,
  namespace      VARCHAR(255)  NOT NULL,
  property_key   VARCHAR(5500) NOT NULL,
  property_value VARCHAR(5500),
  PRIMARY KEY (catalog_name, namespace, property_key)
);
