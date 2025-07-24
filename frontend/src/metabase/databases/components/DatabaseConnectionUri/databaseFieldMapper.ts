import { P, match } from "ts-pattern";

import type { RegexFields } from "./parseConnectionRegex";

export function mapSnowflakeValues(parsedValues: RegexFields) {
  const { db, warehouse } = parsedValues.params ?? {};
  const fieldsMap = new Map<string, string | boolean | undefined>([
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

function mapPostgresValues(parsedValues: RegexFields) {
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.host", parsedValues.host],
    ["details.port", parsedValues.port],
    ["details.dbname", parsedValues.database],
    ["details.user", parsedValues.username],
    ["details.password", parsedValues.password],
  ]);
  return fieldsMap;
}

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
  ]);
  return fieldsMap;
}

function mapAthenaValues(parsedValues: RegexFields) {
  const region = parsedValues.host?.match(/athena\.(.*)\.amazonaws\.com/)?.[1];
  const fieldsMap = new Map<string, string | boolean | undefined>([
    ["details.region", region],
    ["details.password", parsedValues.params?.Password],
  ]);
  return fieldsMap;
}

export function mapDatabaseValues(parsedValues: RegexFields) {
  return match(parsedValues.protocol)
    .with(P.union("postgres", "postgresql"), () =>
      mapPostgresValues(parsedValues),
    )
    .with("snowflake", () => mapSnowflakeValues(parsedValues))
    .with("bigquery", () => mapBigQueryValues(parsedValues))
    .with("clickhouse", () => mapClickhouseValues(parsedValues))
    .with("awsathena", () => mapAthenaValues(parsedValues))
    .otherwise(() => new Map());
}
