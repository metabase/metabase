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
  if (engine === "googleanalytics") {
    return formatGAQuery(query);
  }

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

const GA_ORDERED_PARAMS = [
  "ids",
  "start-date",
  "end-date",
  "metrics",
  "dimensions",
  "sort",
  "filters",
  "segment",
  "samplingLevel",
  "include-empty-rows",
  "start-index",
  "max-results",
];

// does 3 things: removes null values, sorts the keys by the order in the documentation, and formats with 2 space indents
function formatGAQuery(query) {
  if (!query) {
    return "";
  }
  const object = {};
  for (const param of GA_ORDERED_PARAMS) {
    if (query[param] != null) {
      object[param] = query[param];
    }
  }
  return JSON.stringify(object, null, 2);
}
