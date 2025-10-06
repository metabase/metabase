import { P, match } from "ts-pattern";

import type { EngineKey } from "metabase-types/api/settings";

import type { RegexFields } from "./parse-connection-regex";

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
  const { database, host, port } = parsedValues;
  const { UID, PWD } = parsedValues.params ?? {};

  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["name", database],
    ["details.db", database],
    ["details.host", host],
    ["details.port", port],
    ["details.user", UID],
    ["details.password", PWD],
    ["details.additional-options", objectToString(parsedValues.params)],
  ]);

  if (fieldsMap.get("details.additional-options")) {
    fieldsMap.set("details.advanced-options", true);
  }

  return fieldsMap;
}

function mapBigQueryValues(parsedValues: RegexFields) {
  const { ProjectId } = parsedValues.params ?? {};
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["name", ProjectId],
    ["details.project-id", ProjectId],
  ]);
  return fieldsMap;
}

function mapClickhouseValues(parsedValues: RegexFields) {
  const { host, port, database, username } = parsedValues;
  const { user, password, ssl } = parsedValues.params ?? {};

  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["name", database],
    ["details.host", host],
    ["details.port", port],
    ["details.user", username ?? user],
    ["details.password", password],
    ["details.dbname", database],
    ["details.ssl", ssl],
    [
      "details.additional-options",
      objectToString(parsedValues?.params ?? {}, ["user", "password"]),
    ],
  ]);

  // if there are additional options, we need to open the advanced options section
  if (fieldsMap.get("details.additional-options")) {
    fieldsMap.set("details.advanced-options", true);
  }

  return fieldsMap;
}

function mapDatabricksValues(parsedValues: RegexFields) {
  const { host, port } = parsedValues;
  const { httpPath, OAuthSecret, OAuth2ClientId, PWD } =
    parsedValues.params ?? {};
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", host],
    ["details.port", port],
    ["details.http-path", httpPath],
    ["details.oauth-secret", OAuthSecret],
    ["details.client-id", OAuth2ClientId],
    ["details.token", PWD],
  ]);

  if (
    fieldsMap.get("details.oauth-secret") &&
    fieldsMap.get("details.client-id")
  ) {
    fieldsMap.set("details.use-m2m", true);
  }

  fieldsMap.set(
    "details.additional-options",
    objectToString(parsedValues.params, [
      "httpPath",
      "OAuthSecret",
      "OAuth2ClientId",
      "PWD",
    ]),
  );

  return fieldsMap;
}

function mapDruidValues(parsedValues: RegexFields) {
  const { host, port } = parsedValues;
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", host],
    ["details.port", port],
  ]);
  return fieldsMap;
}

function mapMysqlValues(parsedValues: RegexFields) {
  const { host, port, database, username, password } = parsedValues;
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", host],
    ["details.port", port],
    ["details.dbname", database],
    ["name", database],
    ["details.user", username],
    ["details.password", password],
    ["details.ssl", parsedValues.params?.ssl],
    [
      "details.additional-options",
      objectToString(parsedValues.params, ["ssl"]),
    ],
  ]);
  return fieldsMap;
}

function mapOracleValues(parsedValues: RegexFields) {
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", parsedValues.host],
    ["details.port", parsedValues.port],
    ["details.service-name", parsedValues.database],
    ["details.user", parsedValues.username],
    ["details.password", parsedValues.password],
  ]);

  return fieldsMap;
}

function mapPostgresValues(parsedValues: RegexFields) {
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", parsedValues.host],
    ["details.port", parsedValues.port],
    ["details.dbname", parsedValues.database],
    ["name", parsedValues.database],
    ["details.user", parsedValues.username],
    ["details.password", parsedValues.password],
    ["details.ssl", parsedValues.params?.ssl],
    [
      "details.additional-options",
      objectToString(parsedValues.params, ["ssl"]),
    ],
  ]);

  return fieldsMap;
}

function mapPrestoValues(parsedValues: RegexFields) {
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", parsedValues.host],
    ["details.port", parsedValues.port],
    ["name", parsedValues.catalog],
    ["details.catalog", parsedValues.catalog],
    ["details.schema", parsedValues.schema],
    ["details.ssl", parsedValues.params?.SSL],
    [
      "details.additional-options",
      objectToString(parsedValues.params, ["SSL"]),
    ],
  ]);

  if (fieldsMap.get("details.additional-options")) {
    fieldsMap.set("details.advanced-options", true);
  }

  return fieldsMap;
}

export function mapSnowflakeValues(parsedValues: RegexFields) {
  const { host, database, username } = parsedValues;
  const { db, warehouse } = parsedValues.params ?? {};
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.account", host],
    ["details.db", database ?? db],
    ["name", database ?? db],
    ["details.warehouse", warehouse],
    ["details.user", username],
    [
      "details.additional-options",
      objectToString(parsedValues.params, ["db", "warehouse"]),
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
  const { host, port, database } = parsedValues;
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", host ?? parsedValues.params?.Server],
    ["details.port", port],
    ["details.dbname", database],
    ["name", database],
    ["details.jdbc-flags", objectToString(parsedValues.params, ["Server"])],
  ]);

  if (fieldsMap.get("details.jdbc-flags")) {
    fieldsMap.set("details.advanced-options", true);
  }

  return fieldsMap;
}

function mapSqliteValues(parsedValues: RegexFields) {
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.db", parsedValues.path],
  ]);

  return fieldsMap;
}

function mapSqlServerValues(parsedValues: RegexFields) {
  const { host, port, database } = parsedValues;
  const { databaseName, instanceName, username, password, encrypt } =
    parsedValues.params ?? {};
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", host],
    ["details.port", port],
    ["details.db", database ?? databaseName],
    ["name", database ?? databaseName],
    ["details.instance", instanceName],
    ["details.user", username],
    ["details.password", password],
    ["details.ssl", encrypt],
    [
      "details.additional-options",
      objectToString(parsedValues.params, [
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

function mapStarburstTrinoValues(parsedValues: RegexFields) {
  const { host, port, catalog, schema } = parsedValues;
  const { user, password, SSL, roles } = parsedValues.params ?? {};
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", host],
    ["details.port", port],
    ["details.catalog", catalog],
    ["name", catalog],
    ["details.schema", schema],
    ["details.user", user],
    ["details.password", password],
    ["details.ssl", SSL],
    ["details.roles", roles],
    [
      "details.additional-options",
      objectToString(parsedValues.params, ["SSL", "roles", "user", "password"]),
    ],
  ]);

  if (fieldsMap.get("details.additional-options")) {
    fieldsMap.set("details.advanced-options", true);
  }

  return fieldsMap;
}

function mapVerticaValues(parsedValues: RegexFields) {
  const { host, port, database } = parsedValues;
  const { user, password } = parsedValues.params ?? {};

  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", host],
    ["details.port", port],
    ["details.dbname", database],
    ["name", database],
    ["details.user", user],
    ["details.password", password],
    [
      "details.additional-options",
      objectToString(parsedValues.params, ["user", "password"]),
    ],
  ]);

  if (fieldsMap.get("details.additional-options")) {
    fieldsMap.set("details.advanced-options", true);
  }

  return fieldsMap;
}

export function mapDatabaseValues(
  parsedValues: RegexFields,
  engineKey: EngineKey | undefined,
) {
  return match([parsedValues.protocol, engineKey])
    .with([P.union("awsathena", "athena"), "athena"], () =>
      mapAthenaValues(parsedValues),
    )
    .with(["redshift", "redshift"], () => mapRedshiftValues(parsedValues))
    .with(["bigquery", "bigquery-cloud-sdk"], () =>
      mapBigQueryValues(parsedValues),
    )
    .with(["clickhouse", "clickhouse"], () => mapClickhouseValues(parsedValues))
    .with(["databricks", "databricks"], () => mapDatabricksValues(parsedValues))
    .with([P.union("druid", "avatica"), P.union("druid", "druid-jdbc")], () =>
      mapDruidValues(parsedValues),
    )
    .with(["mysql", "mysql"], () => mapMysqlValues(parsedValues))
    .with(["oracle", "oracle"], () => mapOracleValues(parsedValues))
    .with([P.union("postgres", "postgresql"), "postgres"], () =>
      mapPostgresValues(parsedValues),
    )
    .with(["presto", "presto-jdbc"], () => mapPrestoValues(parsedValues))
    .with(["snowflake", "snowflake"], () => mapSnowflakeValues(parsedValues))
    .with([P.union("sparksql", "hive2"), "sparksql"], () =>
      mapSparkSqlValues(parsedValues),
    )
    .with(["sqlserver", "sqlserver"], () => mapSqlServerValues(parsedValues))
    .with(["sqlite", "sqlite"], () => mapSqliteValues(parsedValues))
    .with(["trino", "starburst"], () => mapStarburstTrinoValues(parsedValues))
    .with(["vertica", "vertica"], () => mapVerticaValues(parsedValues))
    .otherwise(() => new Map());
}

/**
 * Converts a Map of flat field paths to nested object format.
 * @param fieldsMap - Map with keys like 'details.ssl' and corresponding values
 * @returns Nested object where 'details.ssl' → true becomes { details: { ssl: true } }
 */
export function mapFieldsToNestedObject(
  fieldsMap: Map<string, string | boolean | undefined>,
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of fieldsMap.entries()) {
    if (value === undefined) {
      continue;
    }

    const parts = key.split(".");
    let current = result;

    // Navigate/create nested structure
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }

    // Set the final value
    const finalKey = parts[parts.length - 1];
    current[finalKey] = value;
  }

  return result;
}

/**
 * Converts an object to a semicolon-separated string.
 * @param obj - The object to convert.
 * @param filterProperties - The properties to filter out.
 * @returns The semicolon-separated string.
 */
function objectToString(
  obj: Record<string, string | undefined> | undefined,
  filterProperties: Array<string> = [],
) {
  if (!obj) {
    return "";
  }

  return Object.entries(obj)
    .filter(([key]) => !filterProperties.includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .join(";");
}
