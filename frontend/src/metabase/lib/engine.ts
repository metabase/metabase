import type { Engine } from "metabase-types/api";

export function getEngineNativeType(engine?: string) {
  switch (engine) {
    case "mongo":
    case "druid":
      return "json";
    default:
      return "sql";
  }
}

export function getNativeQueryLanguage(engine?: string) {
  return getEngineNativeType(engine).toUpperCase();
}

export function getEngineNativeAceMode(engine?: string) {
  switch (engine) {
    case "mongo":
    case "druid":
      return "ace/mode/json";
    default:
      return "ace/mode/sql";
  }
}

type JSONQuery = Record<string, any> | Record<string, any>[];

function formatJsonQuery(query: JSONQuery) {
  return JSON.stringify(query, null, 2);
}

export function formatNativeQuery(query?: string | JSONQuery, engine?: string) {
  if (!query || !engine) {
    return;
  }

  if (getEngineNativeType(engine) === "sql" && typeof query === "string") {
    return formatSQL(query);
  } else if (
    getEngineNativeType(engine) === "json" &&
    typeof query === "object"
  ) {
    return formatJsonQuery(query);
  }
}

export function isDeprecatedEngine(
  engines: Record<string, Engine> = {},
  engine: string,
) {
  return engines[engine] != null && engines[engine]["superseded-by"] != null;
}

function formatSQL(sql: string) {
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
