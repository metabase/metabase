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

type JSONQuery = Record<string, any> | Record<string, any>[];

function formatJsonQuery(query: JSONQuery) {
  return JSON.stringify(query, null, 2);
}

export function formatNativeQuery(query: string | JSONQuery): string {
  return typeof query === "string" ? query : formatJsonQuery(query);
}

export function isDeprecatedEngine(
  engines: Record<string, Engine> = {},
  engine: string,
) {
  return engines[engine] != null && engines[engine]["superseded-by"] != null;
}
