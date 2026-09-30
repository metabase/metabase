import { formatQueryForComparison } from "metabase/querying/components/NativeQueryEditor/utils";

/**
 * Cheap fallback for SQL the formatter can't handle: trims every line, squashes
 * runs of whitespace and drops blank lines. It only neutralizes indentation and
 * spacing changes, not line breaks moved around.
 */
export function collapseWhitespace(sql: string): string {
  return sql
    .split(/\r\n?|\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Brings SQL into a canonical layout so that formatting-only edits (line
 * breaks, indentation, spacing, keyword case) disappear from the diff. Uses the
 * same `sql-formatter` configuration as the native editor's "Format query"
 * button, falling back to whitespace collapsing for non-SQL engines or SQL the
 * formatter can't parse.
 */
export async function normalizeSqlFormatting(
  sql: string,
  engine: string | undefined,
): Promise<string> {
  if (engine) {
    try {
      return (await formatQueryForComparison(sql, engine)).trim();
    } catch {
      // Non-SQL engine or unparseable SQL; use the fallback below
    }
  }
  return collapseWhitespace(sql);
}
