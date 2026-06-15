import type { FormatOptionsWithLanguage, SqlLanguage } from "sql-formatter";

import { getEngineNativeType } from "metabase/databases/utils/engine";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";

import { MIN_HEIGHT_LINES, SCROLL_MARGIN } from "./constants";

const LINE_HEIGHT = 16;

export function getEditorLineHeight(lines: number) {
  return lines * LINE_HEIGHT + 2 * SCROLL_MARGIN;
}

function getLinesForHeight(height: number) {
  return (height - 2 * SCROLL_MARGIN) / LINE_HEIGHT;
}

const FRACTION_OF_TOTAL_VIEW_HEIGHT = 0.4;

// the query editor needs a fixed pixel height for now
// until we extract the resizable component
const FULL_HEIGHT = 400;

// This determines the max height that the editor *automatically* takes.
// - On load, long queries will be capped at this length
// - When loading an empty query, this is the height
// - When the editor grows during typing this is the max height
export function getMaxAutoSizeLines(availableHeight: number) {
  const pixelHeight = availableHeight * FRACTION_OF_TOTAL_VIEW_HEIGHT;
  return Math.ceil(getLinesForHeight(pixelHeight));
}

type GetVisibleLinesCountParams = {
  query?: NativeQuery;
  availableHeight?: number | "full";
};

function getVisibleLinesCount({
  query,
  availableHeight,
}: {
  query?: NativeQuery;
  availableHeight: number;
}) {
  const maxAutoSizeLines = getMaxAutoSizeLines(availableHeight);
  const queryLineCount = query?.lineCount() || maxAutoSizeLines;
  return Math.max(Math.min(queryLineCount, maxAutoSizeLines), MIN_HEIGHT_LINES);
}

export function getInitialEditorHeight({
  query,
  availableHeight = 0,
}: GetVisibleLinesCountParams) {
  if (availableHeight === "full") {
    // override for action editor
    return FULL_HEIGHT;
  }
  const lines = getVisibleLinesCount({ query, availableHeight });
  return getEditorLineHeight(lines);
}

const formatSql = async (sql: string, options: FormatOptionsWithLanguage) => {
  const sqlFormatter = await import("sql-formatter");
  return sqlFormatter.format(sql, options);
};

const formatterDialectByEngine: Record<string, SqlLanguage> = {
  "bigquery-cloud-sdk": "bigquery",
  mysql: "mysql",
  oracle: "plsql",
  postgres: "postgresql",
  "presto-jdbc": "trino",
  redshift: "redshift",
  snowflake: "snowflake",
  sparksql: "spark",
};

// Optional clauses cannot be formatted by sql-formatter for these dialects
const unsupportedFormatterDialects = ["sqlite", "sqlserver"];

function getFormatterDialect(engine: string) {
  if (
    getEngineNativeType(engine) === "json" ||
    unsupportedFormatterDialects.includes(engine)
  ) {
    return null;
  }

  return formatterDialectByEngine[engine] ?? "sql";
}

export function canFormatForEngine(engine: string) {
  return getFormatterDialect(engine) != null;
}

export function getCurrentQuery(
  queryText: string,
  cursorOffset: number,
): string | null {
  const realSemicolons = findRealSemicolonPositions(queryText);

  if (realSemicolons.length === 0) {
    return null;
  }

  let lastBefore = -1;
  let nextAtOrAfter = -1;

  for (const pos of realSemicolons) {
    if (pos < cursorOffset) {
      lastBefore = pos;
    }
    if (pos >= cursorOffset && nextAtOrAfter === -1) {
      nextAtOrAfter = pos;
    }
  }

  const start = lastBefore + 1;
  const end =
    nextAtOrAfter === -1 ? queryText.length : nextAtOrAfter;

  let result = queryText.slice(start, end).trim();

  // Handle cursor positioned between two consecutive semicolons (empty statement)
  if (result === "" && lastBefore >= 0) {
    const idx = realSemicolons.indexOf(lastBefore);
    const prevReal = idx > 0 ? realSemicolons[idx - 1] : -1;
    result = queryText.slice(prevReal + 1, lastBefore).trim();
  }

  if (
    result === "" ||
    result === queryText.trim() ||
    result + ";" === queryText.trim()
  ) {
    return null;
  }

  return result;
}

/**
 * Scans through query text and returns positions of semicolons that act as
 * real statement separators, excluding semicolons inside:
 * - Single-quoted string literals ('...') with '' escaping
 * - Double-quoted identifiers ("...") with "" escaping
 * - Single-line comments (-- ...)
 * - Multi-line comments (/* ... *​/)
 */
function findRealSemicolonPositions(queryText: string): number[] {
  const positions: number[] = [];
  let i = 0;

  while (i < queryText.length) {
    switch (queryText[i]) {
      case "'":
        i++;
        while (i < queryText.length) {
          if (queryText[i] === "'") {
            if (i + 1 < queryText.length && queryText[i + 1] === "'") {
              i += 2;
              continue;
            }
            break;
          }
          i++;
        }
        i++;
        break;

      case '"':
        i++;
        while (i < queryText.length) {
          if (queryText[i] === '"') {
            if (i + 1 < queryText.length && queryText[i + 1] === '"') {
              i += 2;
              continue;
            }
            break;
          }
          i++;
        }
        i++;
        break;

      case "-":
        if (i + 1 < queryText.length && queryText[i + 1] === "-") {
          i += 2;
          while (i < queryText.length && queryText[i] !== "\n") {
            i++;
          }
        } else {
          i++;
        }
        break;

      case "/":
        if (i + 1 < queryText.length && queryText[i + 1] === "*") {
          i += 2;
          while (i < queryText.length) {
            if (
              queryText[i] === "*" &&
              i + 1 < queryText.length &&
              queryText[i + 1] === "/"
            ) {
              i += 2;
              break;
            }
            i++;
          }
        } else {
          i++;
        }
        break;

      case ";":
        positions.push(i);
        i++;
        break;

      default:
        i++;
        break;
    }
  }

  return positions;
}

export function formatQuery(queryText: string, engine: string) {
  const dialect = getFormatterDialect(engine);
  if (!dialect) {
    throw new Error(`No formatter dialect for engine ${engine}`);
  }

  return formatSql(queryText, {
    language: dialect,
    tabWidth: 2,
    keywordCase: "upper",
    linesBetweenQueries: 2,
    paramTypes: {
      // Snippets, parameters, nested questions, and optional clauses
      custom: [
        { regex: "\\{\\{[^\\{\\}]*\\}\\}" },
        { regex: "\\[\\[((.|\\n|\\r)*?)\\]\\]" },
      ],
    },
  });
}
