import type { Engine } from "metabase-types/api";

export function getEngineNativeType(engine?: string): "sql" | "json" {
  switch (engine) {
    case "mongo":
    case "druid":
      return "json";
    default:
      return "sql";
  }
}

export function getNativeQueryLanguage(engine?: string) {
  return getEngineNativeType(engine).toUpperCase() as "SQL" | "JSON";
}

export function getEngineNativeAceMode(engine?: string | null) {
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
    return undefined;
  }

  const engineType = getEngineNativeType(engine);

  if (typeof query === "string" && engineType === "sql") {
    return formatSQL(query);
  }

  if (typeof query === "object" && engineType === "json") {
    return formatJsonQuery(query);
  }

  return undefined;
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
