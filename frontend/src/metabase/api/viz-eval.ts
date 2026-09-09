import type { NativeStructure } from "metabase/visualizations/lib/default-viz/types";
import type { CardId, DatabaseId } from "metabase-types/api";

import { Api } from "./api";

export type VizEvalQueryType = "native" | "query";

export type RandomVizEvalCardRequest = {
  database_id?: DatabaseId;
  query_type?: VizEvalQueryType;
  exclude_judged?: boolean;
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

const JUDGEMENT_TYPE = "viz-judgement";

export const vizEvalApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getRandomVizEvalCard: builder.query<
      RandomVizEvalCardResponse,
      RandomVizEvalCardRequest
    >({
      query: ({ nonce: _nonce, ...params }) => ({
        method: "GET",
        url: "/api/dev/viz-eval/random-card",
        params,
      }),
      keepUnusedDataFor: 0,
    }),
    getNativeStructure: builder.query<NativeStructure, { card_id: CardId }>({
      query: (body) => ({
        method: "POST",
        url: "/api/dev/viz-eval/native-structure",
        body,
      }),
    }),
    listVizJudgements: builder.query<VizJudgement[], void>({
      query: () => `/api/dev/prototype/${JUDGEMENT_TYPE}/`,
      providesTags: [{ type: "viz-judgement", id: "LIST" }],
    }),
    createVizJudgement: builder.mutation<VizJudgement, VizJudgement>({
      query: (body) => ({
        method: "POST",
        url: `/api/dev/prototype/${JUDGEMENT_TYPE}/`,
        body,
      }),
      invalidatesTags: [{ type: "viz-judgement", id: "LIST" }],
    }),
  }),
});

export const {
  useGetRandomVizEvalCardQuery,
  useGetNativeStructureQuery,
  useListVizJudgementsQuery,
  useCreateVizJudgementMutation,
} = vizEvalApi;
