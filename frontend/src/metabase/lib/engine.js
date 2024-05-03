import { getEngines } from "metabase/databases/selectors";
import { formatSQL } from "metabase/lib/formatting";

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
    case "materialize":
      return `${path}/materialize.svg`;
  }
}

function formatJsonQuery(query) {
  return JSON.stringify(query, null, 2);
}

export function formatNativeQuery(query, engine) {
  return getEngineNativeType(engine) === "json"
    ? formatJsonQuery(query, engine)
    : formatSQL(query);
}

export function isDeprecatedEngine(engine, state) {
  const engines = getEngines(state) || {};
  return engines[engine] != null && engines[engine]["superseded-by"] != null;
}
