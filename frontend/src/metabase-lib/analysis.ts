import * as ML from "cljs/metabase.lib.js";
import type {
  DateTimeAbsoluteUnit,
  ProductAnalyticsKind,
} from "metabase-types/api";

import type { Query } from "./query/types";

/** What the product analytics planner builds an analysis's query from. */
export type AnalysisState = {
  kind: ProductAnalyticsKind;
  /** A query on the event table, with the analysis's filters. */
  base_query: Query;
  /** The `columnUniqueKey` of the query's column that identifies a person. */
  "columns.person": string;
  /** The `columnUniqueKey` of the query's column with each event's time. */
  "columns.timestamp": string;
  /** How far back to read events, like "90d". */
  date_range: string;
  /** What the analysis buckets events by. */
  granularity: DateTimeAbsoluteUnit;
  "habit.values": "count";
};

export function buildProductAnalyticsQuery(
  analysisState: AnalysisState,
): Query {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- the cljs module has no types
  return ML.analysis_state_to_mbql(analysisState) as Query;
}
