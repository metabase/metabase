import type { EngineKey } from "metabase-types/api";

/**
 * Maps engine key to the markdown file in docs/databases/connections/
 */
export const ENGINE_DOC_MAP: Partial<Record<EngineKey, string>> = {
  athena: "athena",
  "bigquery-cloud-sdk": "bigquery",
  clickhouse: "clickhouse",
  databricks: "databricks",
  "druid-jdbc": "druid",
  druid: "druid",
  mongo: "mongodb",
  mysql: "mysql",
  oracle: "oracle",
  postgres: "postgresql",
  "presto-jdbc": "presto",
  redshift: "redshift",
  snowflake: "snowflake",
  sparksql: "sparksql",
  sqlite: "sqlite",
  sqlserver: "sql-server",
  starburst: "starburst",
  vertica: "vertica",
};
