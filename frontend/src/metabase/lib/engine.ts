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

export function formatNativeQuery(
  query: string | JSONQuery,
  engine: string,
): string {
  const engineType = getEngineNativeType(engine);

  if (typeof query === "string" && engineType === "sql") {
    return formatSQL(query);
  }

  if (engineType === "json") {
    return typeof query === "object" ? formatJsonQuery(query) : query;
  }

  return typeof query === "string" ? query : formatJsonQuery(query);
}

export function isDeprecatedEngine(
  engines: Record<string, Engine> = {},
  engine: string,
) {
  return engines[engine] != null && engines[engine]["superseded-by"] != null;
}

function isOnCommentLine(sql: string, position: number): boolean {
  const lineStart = sql.lastIndexOf("\n", position);
  const lineContent = sql.substring(lineStart);
  return lineContent.trimStart().startsWith("--");
}

function replaceFirstNotOnCommentLine(
  sql: string,
  pattern: RegExp,
  replacement: string,
): string {
  const replacePattern = new RegExp(pattern.source, "g");
  let match;
  while ((match = replacePattern.exec(sql)) !== null) {
    if (!isOnCommentLine(sql, match.index)) {
      return (
        sql.substring(0, match.index) +
        replacement +
        sql.substring(match.index + match[0].length)
      );
    }
  }
  return sql;
}

function formatSQL(sql: string) {
  sql = replaceFirstNotOnCommentLine(sql, /\sFROM/, "\nFROM");
  sql = replaceFirstNotOnCommentLine(sql, /\sLEFT JOIN/, "\nLEFT JOIN");
  sql = replaceFirstNotOnCommentLine(sql, /\sWHERE/, "\nWHERE");
  sql = replaceFirstNotOnCommentLine(sql, /\sGROUP BY/, "\nGROUP BY");
  sql = replaceFirstNotOnCommentLine(sql, /\sORDER BY/, "\nORDER BY");
  sql = replaceFirstNotOnCommentLine(sql, /\sLIMIT/, "\nLIMIT");
  sql = replaceFirstNotOnCommentLine(sql, /\sAND\s/, "\n   AND ");
  sql = replaceFirstNotOnCommentLine(sql, /\sOR\s/, "\n    OR ");
  return sql;
}
