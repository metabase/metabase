import type { EngineKey } from "metabase-types/api/settings";

type Placeholder = string | undefined;

export const enginesConfig: Record<EngineKey, Placeholder> = {
  athena: "jdbc:athena://WorkGroup=primary;Region=us-east-1;",
  "bigquery-cloud-sdk":
    "jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=MyBigQueryProject;OAuthType=1;",
  clickhouse: "jdbc:clickhouse:https://localhost:8443?ssl=true",
  druid:
    "jdbc:avatica:remote:url=http://localhost:8888/druid/v2/sql/avatica/;transparent_reconnection=true",
  "druid-jdbc":
    "jdbc:avatica:remote:url=http://localhost:8888/druid/v2/sql/avatica/;transparent_reconnection=true",
  databricks:
    "jdbc:databricks://127.0.0.1:8123;httpPath=/sql/1.0/endpoints/abc;OAuthSecret=1234567890;OAuth2ClientId=xyz",
  mongo: undefined,
  mysql: "jdbc:mysql://user:pass@host:3306/dbname?ssl=true",
  oracle:
    "jdbc:oracle:thin:@mydbhost:1521/mydbservice?ssl_server_cert_dn=ServerDN",
  postgres: "jdbc:postgresql://localhost:5432/mydb",
  "presto-jdbc":
    "jdbc:presto://host:1234/sample-catalog/sample-schema?SSL=true&SSLTrustStorePassword=1234",
  redshift:
    "jdbc:redshift://examplecluster.abc123xyz789.us-west-2.redshift.amazonaws.com:5439/dev",
  snowflake:
    "snowflake://example.snowflakecomputing.com/?db=maindb&warehouse=mainwarehouse",
  sparksql: "jdbc:sparksql:Server=127.0.0.1;",
  sqlite: "jdbc:sqlite:///C:/path/to/database.db",
  sqlserver: "jdbc:sqlserver://mydbhost:1433;databaseName=mydb",
  starburst:
    "jdbc:trino://starburst.example.com:43011/hive/sales?user=test&password=secret&SSL=true&roles=system:myrole",
  vertica: "jdbc:vertica://vertica.example.com:1234/databaseName?user=jane",
} as const;
