import * as ML from "cljs/metabase.lib.js";
import type {
  DateTimeAbsoluteUnit,
  DimensionReference,
  ProductAnalyticsKind,
} from "metabase-types/api";

import type { FilterClause, Query } from "./query/types";

/** What the product analytics planner builds an analysis's query from. */
export type AnalysisState = {
  kind: ProductAnalyticsKind;
  /** A query on the event table, with the analysis's filters. */
  base_query: Query;
  /** The `columnUniqueKey` of the query's column that identifies a person. */
  "columns.person": string;
  /** The `columnUniqueKey` of the query's column with each event's time. */
  "columns.timestamp": string;
  granularity: DateTimeAbsoluteUnit;
  /** What to show instead of the analysis's result. `null` shows the result. */
  drill: AnalysisDrill | null;
  "habit.active": AnalysisEvent | null;
  "habit.values": "count" | "percent";
};

/** A clicked cell of an analysis's result, and what to show for it. */
export type AnalysisDrill = {
  /** `actors` lists the people, or sessions, in the cell. */
  type: "actors";
  /** The cell's values. At least one. */
  dimensions: AnalysisDrillDimension[];
};

export type AnalysisDrillDimension = {
  /**
   * The clicked column's `field_ref` from the result dataset.
   */
  column_ref: DimensionReference;
  value: AnalysisDrillValue;
};

export type AnalysisDrillValue = string | number | boolean | null;

/**
 * An event the planner reads. Other keys, like the event's name, are ignored.
 */
export type AnalysisEvent = {
  /**
   * Conditions on the base query's columns. An event matches when all of
   * them do. There's at least one.
   */
  conditions: FilterClause[];
};

export function buildProductAnalyticsQuery(
  analysisState: AnalysisState,
): Query {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- the cljs module has no types
  return ML.analysis_state_to_mbql(analysisState) as Query;
}
