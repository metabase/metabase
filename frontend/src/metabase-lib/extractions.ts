import * as ML from "cljs/metabase.lib.js";

import { expressionParts } from "./expression";
import type { ColumnExtraction, Query, DrillThru } from "./types";

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

export type ColumnExtractionTag = keyof typeof extractions;

const extractions = {
  "hour-of-day": {
    functions: ["hour"],
  },
  "day-of-month": {
    functions: ["day"],
  },
  "day-of-week": {
    functions: ["weekday"],
  },
  "month-of-year": {
    functions: ["month"],
  },
  "quarter-of-year": {
    functions: ["quarter"],
  },
  year: {
    functions: ["year"],
  },
  domain: {
    functions: ["domain"],
  },
  host: {
    functions: ["host"],
  },
  subdomain: {
    functions: ["subdomain"],
  },
};

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
  return [parts.operator];
}
