import { getEngines } from "metabase/databases/selectors";

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

function formatSQL(sql) {
  if (typeof sql === "string") {
    sql = sql.replace(/\sFROM/, "\nFROM");
    sql = sql.replace(/\sLEFT JOIN/, "\nLEFT JOIN");
    sql = sql.replace(/\sWHERE/, "\nWHERE");
    sql = sql.replace(/\sGROUP BY/, "\nGROUP BY");
    sql = sql.replace(/\sORDER BY/, "\nORDER BY");
    sql = sql.replace(/\sLIMIT/, "\nLIMIT");
    sql = sql.replace(/\sAND\s/, "\n   AND ");
    sql = sql.replace(/\sOR\s/, "\n    OR ");

    return sql;
  }
}
