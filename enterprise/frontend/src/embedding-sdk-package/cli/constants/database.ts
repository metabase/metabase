/** Show popular database engines in the CLI */
export const CLI_SHOWN_DB_ENGINES = [
  "postgres",
  "mysql",
  "sqlserver",
  "bigquery-cloud-sdk",
  "snowflake",
  "redshift",
  "mongo",
  "athena",
];

/** Database connection fields that are shown in the CLI */
export const CLI_SHOWN_DB_FIELDS = [
  // Common connection fields for all databases
  "host",
  "port",
  "dbname",
  "user",
  "pass",
  "password",
  "ssl",

  // PostgreSQL fields - support authentication providers
  "use-auth-provider",
  "auth-provider",
  "azure-managed-identity-client-id",
  "oauth-token-url",
  "oauth-token-headers",

  // Snowflake fields
  "use-hostname",
  "account",

  // BigQuery fields
  "project-id",
  "service-account-json",

  // Amazon Athena fields
  "region",
  "workgroup",
  "s3_staging_dir",
  "access_key",
  "secret_key",

  // MongoDB fields
  "use-conn-uri",
  "conn-uri",
  "authdb",
];

export const SAMPLE_DB_ID = 1;
