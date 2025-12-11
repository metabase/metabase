import type { EngineKey } from "metabase-types/api/settings";

type Placeholder = string | undefined;

export const enginesConfig: Record<EngineKey, Placeholder> = {
  athena: "athena://WorkGroup=primary;Region=us-east-1;",
  "bigquery-cloud-sdk":
    "bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=MyBigQueryProject;OAuthType=1;",
  clickhouse: "clickhouse:http://clickhouse.example.com:8443?ssl=true",
  druid:
    "avatica:remote:url=http://druid.example.com:8888/druid/v2/sql/avatica/;transparent_reconnection=true",
  "druid-jdbc":
    "avatica:remote:url=http://druid.example.com:8888/druid/v2/sql/avatica/;transparent_reconnection=true",
  databricks:
    "databricks://databricks.example.com:8123;httpPath=/sql/1.0/endpoints/abc;OAuthSecret=1234567890;OAuth2ClientId=xyz",
  mongo: undefined,
  mysql: "mysql://user:pass@mysql.example.com:3306/dbname?ssl=true",
  oracle:
    "oracle:thin:@oracle.example.com:1521/mydbservice?ssl_server_cert_dn=ServerDN",
  postgres: "postgresql://user:pass:pg.example.com:5432/mydb",
  "presto-jdbc":
    "presto://presto.example.com:1234/sample-catalog/sample-schema?SSL=true&SSLTrustStorePassword=1234",
  redshift:
    "redshift://examplecluster.abc123xyz789.us-west-2.redshift.amazonaws.com:5439/dev",
  snowflake:
    "snowflake://example.snowflakecomputing.com/?db=maindb&warehouse=mainwarehouse",
  sparksql: "sparksql:Server=sparksql.example.com",
  sqlite: "sqlite:///C:/path/to/database.db",
  sqlserver: "sqlserver://mssql.example.com:1433;databaseName=mydb",
  starburst:
    "trino://starburst.example.com:43011/hive/sales?user=test&password=secret&SSL=true&roles=system:myrole",
  vertica: "vertica://vertica.example.com:1234/databaseName?user=jane",
} as const;
