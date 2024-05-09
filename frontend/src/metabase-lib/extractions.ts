import * as ML from "cljs/metabase.lib.js";

import { expressionParts } from "./expression";
import type {
  ColumnExtraction,
  ColumnMetadata,
  Query,
  DrillThru,
  ExpressionParts,
  ExpressionArg,
} from "./types";

export function extract(
  query: Query,
  stageIndex: number,
  extraction: ColumnExtraction,
): Query {
  return ML.extract(query, stageIndex, extraction);
}

export function extractionExpression(
  query: Query,
  stageIndex: number,
  extraction: ColumnExtraction,
) {
  return ML.extraction_expression(query, stageIndex, extraction);
}

export function extractionsForDrill(drill: DrillThru): ColumnExtraction[] {
  return ML.column_extract_drill_extractions(drill);
}

export function columnExtractions(
  query: Query,
  column: ColumnMetadata,
): ColumnExtraction[] {
  return ML.column_extractions(query, column);
}

export type ColumnExtractionTag =
  | "hour-of-day"
  | "day-of-month"
  | "day-of-week"
  | "month-of-year"
  | "quarter-of-year"
  | "year"
  | "domain"
  | "host"
  | "subdomain";

/**
 * Return the functions used by a specific column extraction.
 */
export function functionsUsedByExtraction(
  query: Query,
  stageIndex: number,
  extraction: ColumnExtraction,
): string[] {
  const expression = extractionExpression(query, stageIndex, extraction);
  const parts = expressionParts(query, stageIndex, expression);
  return walk(parts);
}

function walk(parts: ExpressionParts): string[] {
  const res: string[] = [parts.operator];
  parts.args.forEach(arg => {
    if (isExpressionParts(arg)) {
      res.push(...walk(arg));
    }
  });
  return res;
}

export function isExpressionParts(
  arg: ExpressionParts | ExpressionArg,
): arg is ExpressionParts {
  return arg != null && typeof arg === "object" && "operator" in arg;
}
