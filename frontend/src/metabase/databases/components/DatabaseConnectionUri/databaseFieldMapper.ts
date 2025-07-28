import { P, match } from "ts-pattern";

import type { RegexFields } from "./parseConnectionRegex";

function mapBigQueryValues(parsedValues: RegexFields) {
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.project-id", parsedValues.params?.ProjectId],
  ]);
  return fieldsMap;
}

function mapClickhouseValues(parsedValues: RegexFields) {
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", parsedValues?.host],
    ["details.port", parsedValues?.port],
    ["details.user", parsedValues?.username],
    ["details.password", parsedValues?.password],
    ["details.dbname", parsedValues?.path],
    ["details.additional-options", objectToString(parsedValues?.params ?? {})],
  ]);

  // if there are additional options, we need to open the advanced options section
  if (fieldsMap.get("details.additional-options")) {
    fieldsMap.set("details.advanced-options", true);
  }

  return fieldsMap;
}

function mapAthenaValues(parsedValues: RegexFields) {
  const region = parsedValues.host?.match(/athena\.(.*)\.amazonaws\.com/)?.[1];
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.region", region ?? parsedValues.params?.Region],
    ["details.password", parsedValues.params?.Password],
    ["details.workgroup", parsedValues.params?.WorkGroup],
  ]);
  return fieldsMap;
}

function mapRedshiftValues(parsedValues: RegexFields) {
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", parsedValues.host],
    ["details.port", parsedValues.port],
    ["details.dbname", parsedValues.database],
    ["details.user", parsedValues.params?.UID],
    ["details.password", parsedValues.params?.PWD],
  ]);
  return fieldsMap;
}

function mapDatabricksValues(parsedValues: RegexFields) {
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", parsedValues.host],
    ["details.port", parsedValues.port],
    ["details.http-path", parsedValues.params?.httpPath],
    ["details.oauth-secret", parsedValues.params?.OAuthSecret],
    ["details.client-id", parsedValues.params?.OAuth2ClientId],
    ["details.token", parsedValues.params?.PWD],
  ]);

  if (
    fieldsMap.get("details.oauth-secret") &&
    fieldsMap.get("details.client-id")
  ) {
    fieldsMap.set("details.use-m2m", true);
  }

  fieldsMap.set(
    "details.additional-options",
    objectToString(parsedValues.params ?? {}, [
      "httpPath",
      "OAuthSecret",
      "OAuth2ClientId",
      "PWD",
    ]),
  );

  return fieldsMap;
}

function mapDruidValues(parsedValues: RegexFields) {
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", parsedValues.host],
    ["details.port", parsedValues.port],
  ]);
  return fieldsMap;
}

function mapMysqlValues(parsedValues: RegexFields) {
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", parsedValues.host],
    ["details.port", parsedValues.port],
    ["details.dbname", parsedValues.database],
    ["details.user", parsedValues.username],
    ["details.password", parsedValues.password],
    ["details.ssl", parsedValues.params?.ssl],
    [
      "details.additional-options",
      objectToString(parsedValues.params ?? {}, ["ssl"]),
    ],
  ]);
  return fieldsMap;
}

function mapPostgresValues(parsedValues: RegexFields) {
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", parsedValues.host],
    ["details.port", parsedValues.port],
    ["details.dbname", parsedValues.database],
    ["details.user", parsedValues.username],
    ["details.password", parsedValues.password],
    ["details.ssl", parsedValues.params?.ssl],
    [
      "details.additional-options",
      objectToString(parsedValues.params ?? {}, ["ssl"]),
    ],
  ]);
  return fieldsMap;
}

function mapPrestoValues(parsedValues: RegexFields) {
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", parsedValues.host],
    ["details.port", parsedValues.port],
    ["details.catalog", parsedValues.catalog],
    ["details.schema", parsedValues.schema],
    ["details.ssl", parsedValues.params?.SSL],
    [
      "details.additional-options",
      objectToString(parsedValues.params ?? {}, ["SSL"]),
    ],
  ]);
  return fieldsMap;
}

export function mapSnowflakeValues(parsedValues: RegexFields) {
  const { db, warehouse } = parsedValues.params ?? {};
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.account", parsedValues.host],
    ["details.db", db],
    ["details.warehouse", warehouse],
    ["details.user", parsedValues.username],
    [
      "details.additional-options",
      objectToString(parsedValues.params ?? {}, ["db", "warehouse"]),
    ],
  ]);

  if (parsedValues.password) {
    fieldsMap.set("details.use-password", true);
    fieldsMap.set("details.password", parsedValues.password);
  }

  if (fieldsMap.get("details.additional-options")) {
    fieldsMap.set("details.advanced-options", true);
  }

  return fieldsMap;
}

function mapSparkSqlValues(parsedValues: RegexFields) {
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", parsedValues.host ?? parsedValues.params?.Server],
    ["details.port", parsedValues.port],
    ["details.database", parsedValues.database],
    ["details.jdbc-flags", objectToString(parsedValues.params ?? {})],
  ]);

  if (fieldsMap.get("details.jdbc-flags")) {
    fieldsMap.set("details.advanced-options", true);
  }

  return fieldsMap;
}

function mapSqlServerValues(parsedValues: RegexFields) {
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", parsedValues.host],
    ["details.port", parsedValues.port],
    [
      "details.dbname",
      parsedValues.database ?? parsedValues.params?.databaseName,
    ],
    ["details.instance", parsedValues.params?.instanceName],
    ["details.user", parsedValues.params?.username],
    ["details.password", parsedValues.params?.password],
    ["details.ssl", parsedValues.params?.encrypt],
    [
      "details.additional-options",
      objectToString(parsedValues.params ?? {}, [
        "databaseName",
        "instanceName",
        "username",
        "password",
        "encrypt",
      ]),
    ],
  ]);

  if (fieldsMap.get("details.additional-options")) {
    fieldsMap.set("details.advanced-options", true);
  }

  return fieldsMap;
}

export function mapDatabaseValues(parsedValues: RegexFields) {
  return match(parsedValues.protocol)
    .with(P.union("awsathena", "athena"), () => mapAthenaValues(parsedValues))
    .with("redshift", () => mapRedshiftValues(parsedValues))
    .with("bigquery", () => mapBigQueryValues(parsedValues))
    .with("clickhouse", () => mapClickhouseValues(parsedValues))
    .with("databricks", () => mapDatabricksValues(parsedValues))
    .with(P.union("druid", "avatica"), () => mapDruidValues(parsedValues))
    .with("mysql", () => mapMysqlValues(parsedValues))
    .with(P.union("postgres", "postgresql"), () =>
      mapPostgresValues(parsedValues),
    )
    .with("presto", () => mapPrestoValues(parsedValues))
    .with("snowflake", () => mapSnowflakeValues(parsedValues))
    .with(P.union("sparksql", "hive2"), () => mapSparkSqlValues(parsedValues))
    .with("sqlserver", () => mapSqlServerValues(parsedValues))
    .otherwise(() => new Map());
}

/**
 * Converts an object to a semicolon-separated string.
 * @param obj - The object to convert.
 * @param filterProperties - The properties to filter out.
 * @returns The semicolon-separated string.
 */
function objectToString(
  obj: Record<string, string>,
  filterProperties: Array<string> = [],
) {
  return Object.entries(obj)
    .filter(([key]) => !filterProperties.includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .join(";");
}
