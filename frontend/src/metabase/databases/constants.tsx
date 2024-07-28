import { t } from "ttag";

import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";

import DatabaseAuthCodeDescription from "./components/DatabaseAuthCodeDescription";
import DatabaseAuthProviderSectionField from "./components/DatabaseAuthProviderSectionField";
import DatabaseCacheScheduleField from "./components/DatabaseCacheScheduleField";
import DatabaseClientIdDescription from "./components/DatabaseClientIdDescription";
import DatabaseConnectionSectionField from "./components/DatabaseConnectionSectionField";
import DatabaseHostnameSectionField from "./components/DatabaseHostnameSectionField";
import DatabaseScheduleToggleField from "./components/DatabaseScheduleToggleField";
import DatabaseSshDescription from "./components/DatabaseSshDescription";
import DatabaseSslKeyDescription from "./components/DatabaseSslKeyDescription";
import DatabaseSyncScheduleField from "./components/DatabaseSyncScheduleField";
import type { EngineFieldOverride } from "./types";

export const SAVED_QUESTIONS_DATABASE = {
  id: SAVED_QUESTIONS_VIRTUAL_DB_ID,
  name: t`Saved Questions`,
  is_saved_questions: true,
  features: ["basic-aggregations"],
};

export const ELEVATED_ENGINES = [
  "mysql",
  "postgres",
  "sqlserver",
  "redshift",
  "bigquery-cloud-sdk",
  "snowflake",
];

export const ENGINE_LOGO: Record<string, string> = {
  bigquery: "bigquery.svg",
  "bigquery-cloud-sdk": "bigquery.svg",
  druid: "druid.svg",
  h2: "h2.svg",
  mongo: "mongo.svg",
  mysql: "mysql.svg",
  oracle: "oracle.svg",
  postgres: "postgres.svg",
  presto: "presto.svg",
  "presto-jdbc": "presto.svg",
  redshift: "redshift.svg",
  snowflake: "snowflake.svg",
  sparksql: "sparksql.svg",
  starburst: "starburst.svg",
  sqlite: "sqlite.svg",
  sqlserver: "sqlserver.svg",
  vertica: "vertica.svg",
};

export const ADVANCED_FIELDS = [
  "auto_run_queries",
  "let-user-control-scheduling",
  "cache_ttl",
];

export const FIELD_OVERRIDES: Record<string, EngineFieldOverride> = {
  "tunnel-enabled": {
    title: t`Use an SSH-tunnel`,
    description: <DatabaseSshDescription />,
  },
  "use-jvm-timezone": {
    title: t`Use the Java Virtual Machine (JVM) timezone`,
    description: t`We suggest you leave this off unless you plan on doing a lot of manual timezone casting with this data.`,
  },
  "include-user-id-and-hash": {
    title: t`Include User ID and query hash in queries`,
    description: t`This can be useful for auditing and debugging, but prevents  databases from caching results and may increase your costs.`,
  },
  "use-srv": {
    title: t`Connect using DNS SRV`,
    description: t`If you're connecting to an Atlas cluster, you might need to turn this on. Note that your provided host must be a fully qualified domain name.`,
  },
  "client-id": {
    description: <DatabaseClientIdDescription />,
  },
  "auth-code": {
    description: <DatabaseAuthCodeDescription />,
  },
  "tunnel-private-key": {
    title: t`SSH private key`,
    placeholder: t`Paste the contents of your ssh private key here`,
    type: "text",
  },
  "tunnel-private-key-passphrase": {
    title: t`Passphrase for the SSH private key`,
  },
  "tunnel-auth-option": {
    title: t`SSH authentication`,
    options: [
      { name: t`SSH Key`, value: "ssh-key" },
      { name: t`Password`, value: "password" },
    ],
  },
  "ssl-cert": {
    title: t`Server SSL certificate chain`,
    placeholder: t`Paste the contents of the server's SSL certificate chain here`,
    type: "text",
  },
  "ssl-key-options": {
    description: <DatabaseSslKeyDescription />,
  },
  "use-conn-uri": {
    type: DatabaseConnectionSectionField,
  },
  "use-hostname": {
    type: DatabaseHostnameSectionField,
  },
  "use-auth-provider": {
    type: DatabaseAuthProviderSectionField,
  },
  "let-user-control-scheduling": {
    type: DatabaseScheduleToggleField,
  },
  "schedules.metadata_sync": {
    name: "schedules.metadata_sync",
    type: DatabaseSyncScheduleField,
  },
  "schedules.cache_field_values": {
    name: "schedules.cache_field_values",
    type: DatabaseCacheScheduleField,
  },
  auto_run_queries: {
    name: "auto_run_queries",
  },
  refingerprint: {
    name: "refingerprint",
  },
};
