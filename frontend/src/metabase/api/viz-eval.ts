import type { NativeStructure } from "metabase/visualizations/lib/default-viz/types";
import type { VizReport } from "metabase/visualizations/lib/viz-heuristics";
import type { CardId, DatabaseId } from "metabase-types/api";

import { Api } from "./api";

export type VizEvalQueryType = "native" | "query";

export type RandomVizEvalCardRequest = {
  "database-id"?: DatabaseId;
  "query-type"?: VizEvalQueryType;
  "exclude-judged"?: boolean;
  nonce?: number;
};

export type RandomVizEvalCardResponse = {
  id: CardId;
  remaining: number;
};

export type VizJudgementVerdict = "saved" | "current" | "new" | "tie" | "skip";

export type VizJudgementTimings = {
  stage1Ms: number;
  rowStatsMs: number;
  stage2Ms: number;
  reconcileMs: number;
  totalMs: number;
  nativeParseMs: number | null;
};

export type VizJudgement = {
  id?: number;
  card_id: CardId;
  database_id: DatabaseId | null;
  query_type: VizEvalQueryType | null;
  verdict: VizJudgementVerdict;
  stage_shown: 1 | 2 | null;
  saved_display: string | null;
  current_display: string | null;
  new_stage1_display: string | null;
  new_stage2_display: string | null;
  final_display: string | null;
  new_settings: Record<string, unknown> | null;
  reconcile_outcome: string | null;
  confidence: number | null;
  chosen_penalties: Array<{ id: string; contribution: number }> | null;
  col_count: number | null;
  row_count: number | null;
  timings: VizJudgementTimings | null;
  note: string | null;
  user_id: number | null;
  created_at: string;
};

export type OverviewEntityType = "metric" | "table" | "transform";

export type OverviewJudgementAxis = "generation" | "visualization";

export type OverviewJudgementVerdict =
  | "old"
  | "new"
  | "both-fine"
  | "both-suck";

export type OverviewJudgement = {
  id?: number;
  entity_type: OverviewEntityType;
  entity_id: number;
  entity_name: string | null;
  axis: OverviewJudgementAxis;
  verdict: OverviewJudgementVerdict;
  gen: string;
  baseline_gen: string;
  viz: string;
  baseline_viz: string;
  tiles: VizReport[];
  baseline_tiles?: VizReport[];
  note: string | null;
  user_id: number | null;
  created_at: string;
};

export type ListOverviewJudgementsRequest = {
  "entity-type"?: OverviewEntityType;
  "entity-id"?: number;
};

export const vizEvalApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getRandomVizEvalCard: builder.query<
      RandomVizEvalCardResponse,
      RandomVizEvalCardRequest
    >({
      query: ({ nonce: _nonce, ...params }) => ({
        method: "GET",
        url: "/api/viz-eval/random-card",
        params,
      }),
      keepUnusedDataFor: 0,
    }),
    getNativeStructure: builder.query<NativeStructure, { card_id: CardId }>({
      query: (body) => ({
        method: "POST",
        url: "/api/viz-eval/native-structure",
        body,
      }),
    }),
    listVizJudgements: builder.query<VizJudgement[], void>({
      query: () => "/api/viz-eval/judgements",
      providesTags: [{ type: "viz-judgement", id: "LIST" }],
    }),
    createVizJudgement: builder.mutation<VizJudgement, VizJudgement>({
      query: (body) => ({
        method: "POST",
        url: "/api/viz-eval/judgements",
        body,
      }),
      invalidatesTags: [{ type: "viz-judgement", id: "LIST" }],
    }),
    listOverviewJudgements: builder.query<
      OverviewJudgement[],
      ListOverviewJudgementsRequest | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/viz-eval/overview-judgements",
        params: params ?? undefined,
      }),
      providesTags: [{ type: "overview-judgement", id: "LIST" }],
    }),
    createOverviewJudgement: builder.mutation<
      OverviewJudgement,
      OverviewJudgement
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/viz-eval/overview-judgements",
        body,
      }),
      invalidatesTags: [{ type: "overview-judgement", id: "LIST" }],
    }),
  }),
});

export const {
  useGetRandomVizEvalCardQuery,
  useGetNativeStructureQuery,
  useListVizJudgementsQuery,
  useCreateVizJudgementMutation,
  useListOverviewJudgementsQuery,
  useCreateOverviewJudgementMutation,
} = vizEvalApi;
