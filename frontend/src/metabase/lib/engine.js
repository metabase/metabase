import Settings from "metabase/lib/settings";
import { formatSQL } from "metabase/lib/formatting";

export function getDefaultEngine() {
  const engines = Object.keys(Settings.get("engines"));
  return engines.includes("postgres") ? "postgres" : engines[0];
}

export function getEngineNativeType(engine) {
  switch (engine) {
    case "mongo":
    case "druid":
      return "json";
    default:
      return "sql";
  }
}

export function getNativeQueryLanguage(engine) {
  return getEngineNativeType(engine).toUpperCase();
}

export function getEngineNativeAceMode(engine) {
  switch (engine) {
    case "mongo":
    case "druid":
      return "ace/mode/json";
    case "mysql":
      return "ace/mode/mysql";
    case "postgres":
      return "ace/mode/pgsql";
    case "sqlserver":
      return "ace/mode/sqlserver";
    default:
      return "ace/mode/sql";
  }
}

export function getEngineLogo(engine) {
  const path = `app/assets/img/drivers`;

  switch (engine) {
    case "bigquery":
    case "druid":
    case "h2":
    case "mongo":
    case "mysql":
    case "oracle":
    case "postgres":
    case "redshift":
    case "snowflake":
    case "sparksql":
    case "sqlite":
    case "sqlserver":
    case "vertica":
      return `${path}/${engine}.svg`;
    case "bigquery-cloud-sdk":
      return `${path}/bigquery.svg`;
    case "presto-jdbc":
      return `${path}/presto.svg`;
    case "starburst":
      return `${path}/starburst.svg`;
  }
}

export function getElevatedEngines() {
  return [
    "mysql",
    "postgres",
    "sqlserver",
    "redshift",
    "bigquery-cloud-sdk",
    "snowflake",
  ];
}

export function formatJsonQuery(query, engine) {
  return JSON.stringify(query, null, 2);
}

export function formatNativeQuery(query, engine) {
  return getEngineNativeType(engine) === "json"
    ? formatJsonQuery(query, engine)
    : formatSQL(query);
}

export function isDeprecatedEngine(engine) {
  const engines = Settings.get("engines", {});
  return engines[engine] != null && engines[engine]["superseded-by"] != null;
}
