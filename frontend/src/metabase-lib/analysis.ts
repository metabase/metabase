import * as ML from "cljs/metabase.lib.js";
import type {
  DateTimeAbsoluteUnit,
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
  "habit.active": AnalysisEvent | null;
  "habit.values": "count" | "percent";
};

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
