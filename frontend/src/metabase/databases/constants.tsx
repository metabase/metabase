import { t } from "ttag";

import athenaLogo from "assets/img/drivers/athena.svg?url";
import bigqueryLogo from "assets/img/drivers/bigquery.svg?url";
import clickhouseLogo from "assets/img/drivers/clickhouse.svg?url";
import databricksLogo from "assets/img/drivers/databricks.svg?url";
import druidLogo from "assets/img/drivers/druid.svg?url";
import h2Logo from "assets/img/drivers/h2.svg?url";
import mongoLogo from "assets/img/drivers/mongo.svg?url";
import mysqlLogo from "assets/img/drivers/mysql.svg?url";
import oracleLogo from "assets/img/drivers/oracle.svg?url";
import postgresLogo from "assets/img/drivers/postgres.svg?url";
import prestoLogo from "assets/img/drivers/presto.svg?url";
import redshiftLogo from "assets/img/drivers/redshift.svg?url";
import snowflakeLogo from "assets/img/drivers/snowflake.svg?url";
import sparksqlLogo from "assets/img/drivers/sparksql.svg?url";
import sqliteLogo from "assets/img/drivers/sqlite.svg?url";
import sqlserverLogo from "assets/img/drivers/sqlserver.svg?url";
import starburstLogo from "assets/img/drivers/starburst.svg?url";
import verticaLogo from "assets/img/drivers/vertica.svg?url";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";

import DatabaseAuthCodeDescription from "./components/DatabaseAuthCodeDescription";
import DatabaseAuthProviderSectionField from "./components/DatabaseAuthProviderSectionField";
import { DatabaseCacheScheduleField } from "./components/DatabaseCacheScheduleField";
import DatabaseClientIdDescription from "./components/DatabaseClientIdDescription";
import { DatabaseConnectionSectionField } from "./components/DatabaseConnectionSectionField";
import DatabaseHostnameSectionField from "./components/DatabaseHostnameSectionField";
import DatabaseScheduleToggleField from "./components/DatabaseScheduleToggleField";
import DatabaseSshDescription from "./components/DatabaseSshDescription";
import DatabaseSslKeyDescription from "./components/DatabaseSslKeyDescription";
import DatabaseSyncScheduleField from "./components/DatabaseSyncScheduleField";
import type { EngineFieldOverride } from "./types";

export const SAVED_QUESTIONS_DATABASE = {
  id: SAVED_QUESTIONS_VIRTUAL_DB_ID,
  get name() {
    return t`Saved Questions`;
  },
  is_saved_questions: true,
  features: ["basic-aggregations"],
};

/**
 * How many of the (elevated) engines we want to show in the DatabaseEngineList widget/component.
 * This should ensure that the list still looks visually pleasing in the modal even if we alter
 * the ELEVATED_ENGINES array.
 */
export const MAX_INITIAL_ENGINES_SHOWN = 6;

export const ELEVATED_ENGINES = [
  "mysql",
  "postgres",
  "sqlserver",
  "redshift",
  "bigquery-cloud-sdk",
  "snowflake",
];

// Although some drivers like MongoDB or H2 have table editing capabilities,
// they were not thoroughly tested and verified.
// We want to, for now at least, allow users to turn on table editing
// just for PostgreSQL and MySQL databases.
export const ALLOWED_ENGINES_FOR_TABLE_EDITING = ["postgres", "mysql"];

export const ENGINE_LOGO: Record<string, string> = {
  athena: athenaLogo,
  bigquery: bigqueryLogo,
  "bigquery-cloud-sdk": bigqueryLogo,
  clickhouse: clickhouseLogo,
  databricks: databricksLogo,
  druid: druidLogo,
  "druid-jdbc": druidLogo,
  h2: h2Logo,
  mongo: mongoLogo,
  mysql: mysqlLogo,
  oracle: oracleLogo,
  postgres: postgresLogo,
  presto: prestoLogo,
  "presto-jdbc": prestoLogo,
  redshift: redshiftLogo,
  snowflake: snowflakeLogo,
  sparksql: sparksqlLogo,
  starburst: starburstLogo,
  sqlite: sqliteLogo,
  sqlserver: sqlserverLogo,
  vertica: verticaLogo,
};

export const ADVANCED_FIELDS = [
  "auto_run_queries",
  "let-user-control-scheduling",
  "cache_ttl",
];

export const FIELD_OVERRIDES: Record<string, EngineFieldOverride> = {
  "tunnel-enabled": {
    get title() {
      return t`Use an SSH-tunnel`;
    },
    description: <DatabaseSshDescription />,
  },
  "use-jvm-timezone": {
    get title() {
      return t`Use the Java Virtual Machine (JVM) timezone`;
    },
    get description() {
      return t`We suggest you leave this off unless you plan on doing a lot of manual timezone casting with this data.`;
    },
  },
  "include-user-id-and-hash": {
    get title() {
      return t`Include User ID and query hash in queries`;
    },
    get description() {
      return t`This can be useful for auditing and debugging, but prevents  databases from caching results and may increase your costs.`;
    },
  },
  "use-srv": {
    get title() {
      return t`Connect using DNS SRV`;
    },
    get description() {
      return t`If you're connecting to an Atlas cluster, you might need to turn this on. Note that your provided host must be a fully qualified domain name.`;
    },
  },
  "client-id": {
    description: <DatabaseClientIdDescription />,
  },
  "auth-code": {
    description: <DatabaseAuthCodeDescription />,
  },
  "tunnel-private-key": {
    get title() {
      return t`SSH private key`;
    },
    get placeholder() {
      return t`Paste the contents of your ssh private key here`;
    },
    type: "text",
  },
  "tunnel-private-key-passphrase": {
    get title() {
      return t`Passphrase for the SSH private key`;
    },
  },
  "tunnel-auth-option": {
    get title() {
      return t`SSH authentication`;
    },
    options: [
      {
        get name() {
          return t`SSH Key`;
        },
        value: "ssh-key",
      },
      {
        get name() {
          return t`Password`;
        },
        value: "password",
      },
    ],
  },
  "ssl-cert": {
    get title() {
      return t`Server SSL certificate chain`;
    },
    get placeholder() {
      return t`Paste the contents of the server's SSL certificate chain here`;
    },
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
