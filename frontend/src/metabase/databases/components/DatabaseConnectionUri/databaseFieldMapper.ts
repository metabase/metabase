import { P, match } from "ts-pattern";

import type { UriFields } from "./parseConnectionUri";

export function mapSnowflakeValues(parsedValues: UriFields) {
  const { db, warehouse } = parsedValues.params ?? {};
  const fieldsMap = new Map<string, string | boolean>([
    ["details.account", parsedValues.host],
    ["details.db", db],
    ["details.warehouse", warehouse],
    ["details.user", parsedValues.username],
  ]);
  if (parsedValues.password) {
    fieldsMap.set("details.use-password", true);
    fieldsMap.set("details.password", parsedValues.password);
  }
  return fieldsMap;
}

function mapPostgresValues(parsedValues: UriFields) {
  const fieldsMap = new Map<string, string | boolean>([
    ["details.host", parsedValues.host],
    ["details.port", parsedValues.port],
    ["details.dbname", parsedValues.database],
    ["details.user", parsedValues.username],
    ["details.password", parsedValues.password],
  ]);
  return fieldsMap;
}

function mapBigQueryValues(parsedValues: UriFields) {
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.project-id", parsedValues.params?.ProjectId],
  ]);
  return fieldsMap;
}

function mapClickhouseValues(parsedValues: UriFields) {
  const fieldsMap = new Map<string, string | boolean>([
    ["details.host", parsedValues.host],
    ["details.port", parsedValues.port],
    ["details.user", parsedValues.username],
    ["details.password", parsedValues.password],
    ["details.dbname", parsedValues.path],
  ]);
  return fieldsMap;
}

export function mapDatabaseValues(parsedValues: UriFields) {
  return match(parsedValues.protocol)
    .with(P.union("postgres", "postgresql"), () =>
      mapPostgresValues(parsedValues),
    )
    .with("snowflake", () => mapSnowflakeValues(parsedValues))
    .with("bigquery", () => mapBigQueryValues(parsedValues))
    .with("clickhouse", () => mapClickhouseValues(parsedValues))
    .otherwise(() => new Map());
}
