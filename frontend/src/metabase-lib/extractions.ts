import * as ML from "cljs/metabase.lib.js";

import type { ColumnExtraction, Query } from "./types";

export function extract(
  query: Query,
  stageIndex: number,
  extraction: ColumnExtraction,
): Query {
  return ML.extract(query, stageIndex, extraction);
}

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
export function functionsUsedByExtraction(tag: string): string[] {
  return extractions[tag as keyof typeof extractions]?.functions ?? [];
}
