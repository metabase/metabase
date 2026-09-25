import type {
  CardId,
  DashboardId,
  DatabaseId,
  SchemaName,
  TableId,
  VisualizationDisplay,
} from "metabase-types/api";

import { Api } from "./api";
import type { JevFilterSuggestion, JevQuestionColumn } from "./jev-filters";
import { idTag, invalidateTags, listTag } from "./tags";

export type JevCreateIntentStatus = "ok" | "unavailable" | "no-tables";
export type JevQuestionPlanStatus = "ok" | "unavailable";
export type JevDashboardPlanStatus = "ok" | "unavailable" | "no-cards";

export type JevCreateKind = "question" | "dashboard" | "document";

/** The kinds built from existing questions. */
export type JevCardCollectionKind = Exclude<JevCreateKind, "question">;

export interface JevCreateIntentTable {
  id: TableId;
  db_id: DatabaseId;
  name: string;
  display_name: string;
  schema: SchemaName | null;
  /** How likely this is THE table for a single question (sums to ≤ 1). */
  probability: number;
  /** 0..1, independently: is this table relevant to a dashboard on the topic. */
  relevance: number;
}

export interface JevCreateIntent {
  status: JevCreateIntentStatus;
  error?: string;
  elapsed_ms: number;
  jev_ms?: number;
  kind: {
    choice: JevCreateKind;
    probabilities: Record<JevCreateKind, number>;
  } | null;
  /** Sorted by `probability`, most likely first. */
  tables: JevCreateIntentTable[];
}

export type JevRankedOption<T> = T & { label: string; probability: number };

/** Most likely first; always at least one option. */
export interface JevRanked<T> {
  options: JevRankedOption<T>[];
}

export type JevAggregationOperator =
  | "rows"
  | "count"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "distinct";

export interface JevAggregationPick {
  operator: JevAggregationOperator;
  column_key: string | null;
}

export interface JevBreakoutPick {
  /** `null` means no grouping. */
  column_key: string | null;
}

export type JevTemporalUnit =
  | "default"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

export interface JevTemporalUnitPick {
  unit: JevTemporalUnit;
}

export type JevQuestionDisplay =
  | "auto"
  | "table"
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "row"
  | "scalar"
  | "map";

export interface JevDisplayPick {
  display: JevQuestionDisplay;
}

export interface JevQuestionPlanRequest {
  text: string;
  table_id: TableId;
  table_name: string;
  columns: JevQuestionColumn[];
}

export interface JevQuestionPlan {
  status: JevQuestionPlanStatus;
  elapsed_ms: number;
  jev_ms?: number;
  /** `parameter_id` is a column key from the request. */
  filters: JevFilterSuggestion[];
  aggregation: JevRanked<JevAggregationPick>;
  breakout: JevRanked<JevBreakoutPick>;
  /** Only meaningful when the breakout column is a date. */
  temporal_unit: JevRanked<JevTemporalUnitPick>;
  display: JevRanked<JevDisplayPick>;
}

export interface JevDashboardPlanRequest {
  text: string;
  table_ids: TableId[];
  /** Defaults to "dashboard". */
  kind?: JevCardCollectionKind;
}

export interface JevDashboardPlanCard {
  card_id: CardId;
  name: string;
  display: VisualizationDisplay | null;
  table_id: TableId | null;
  collection_name: string | null;
  probability: number;
  selected: boolean;
}

export interface JevDashboardPlan {
  status: JevDashboardPlanStatus;
  elapsed_ms: number;
  jev_ms?: number;
  /** A suggested dashboard name: the user's text, tidied. */
  name: string;
  tables: { id: TableId; display_name: string }[];
  /** Most relevant first. */
  cards: JevDashboardPlanCard[];
}

/** A new dashcard as `PUT /api/dashboard/:id` accepts it: a negative `id` creates it. */
export interface JevNewDashcard {
  id: number;
  card_id: CardId;
  row: number;
  col: number;
  size_x: number;
  size_y: number;
}

export interface JevAddDashcardsRequest {
  dashboardId: DashboardId;
  dashcards: JevNewDashcard[];
}

export const jevCreateApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getJevCreateIntent: builder.mutation<JevCreateIntent, { text: string }>({
      query: (body) => ({
        method: "POST",
        url: "/api/jev/create/intent",
        body,
      }),
    }),
    getJevQuestionPlan: builder.mutation<
      JevQuestionPlan,
      JevQuestionPlanRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/jev/create/question",
        body,
      }),
    }),
    getJevDashboardPlan: builder.mutation<
      JevDashboardPlan,
      JevDashboardPlanRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/jev/create/dashboard",
        body,
      }),
    }),
    /** Adds dashcards to a dashboard that has none yet (the PUT replaces the dashcard list). */
    addJevDashcards: builder.mutation<unknown, JevAddDashcardsRequest>({
      query: ({ dashboardId, dashcards }) => ({
        method: "PUT",
        url: `/api/dashboard/${dashboardId}`,
        body: { dashcards },
      }),
      invalidatesTags: (_, error, { dashboardId }) =>
        invalidateTags(error, [
          listTag("dashboard"),
          idTag("dashboard", dashboardId),
        ]),
    }),
  }),
});

export const {
  useGetJevCreateIntentMutation,
  useGetJevQuestionPlanMutation,
  useGetJevDashboardPlanMutation,
  useAddJevDashcardsMutation,
} = jevCreateApi;
