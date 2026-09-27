import type {
  DashboardId,
  FieldId,
  ParameterValueOrArray,
} from "metabase-types/api";

import { Api } from "./api";
import type { JevUsage } from "./jev";

export interface JevFilterAlternative {
  value: ParameterValueOrArray;
  label: string;
  probability: number;
  /** Can differ from the row's type, e.g. "number/>=" vs "number/between" for question number columns. */
  parameter_type?: string;
}

export interface JevFilterSuggestion {
  /** A dashboard parameter id, or a question column `key`. */
  parameter_id: string;
  parameter_name: string;
  parameter_type: string;
  /** Jev's pick: a Metabase parameter value, ready to hand to `setParameterValue`. */
  value: ParameterValueOrArray;
  label: string;
  confidence: number;
  /** Ranked, the first one is the pick; never contains "none". */
  alternatives?: JevFilterAlternative[];
}

export type JevFilterStatus =
  | "ok"
  | "unavailable"
  | "empty-text"
  | "no-candidates";

export interface JevFilterSuggestions {
  status: JevFilterStatus;
  filters: JevFilterSuggestion[];
  candidate_count: number;
  elapsed_ms: number;
  jev_ms?: number;
  usage?: JevUsage;
  error?: string;
}

export interface JevFilterSuggestionsRequest {
  dashboardId: DashboardId;
  text: string;
}

export type JevQuestionColumnKind = "date" | "values" | "number";

export interface JevQuestionColumn {
  key: string;
  field_id?: FieldId | null;
  name: string;
  display_name: string;
  kind: JevQuestionColumnKind;
  description?: string | null;
}

export interface JevQuestionSlot {
  key: string;
  display_name: string;
  kind: string;
  probability: number;
}

export interface JevQuestionSlotsRequest {
  question_name?: string;
  columns: JevQuestionColumn[];
}

export interface JevQuestionSlots {
  status: JevFilterStatus;
  elapsed_ms: number;
  jev_ms?: number;
  slots: JevQuestionSlot[];
}

export interface JevQuestionFilterSuggestionsRequest {
  text: string;
  question_name?: string;
  columns: JevQuestionColumn[];
  slot_keys: string[];
}

export const jevFiltersApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    suggestDashboardFilters: builder.mutation<
      JevFilterSuggestions,
      JevFilterSuggestionsRequest
    >({
      query: ({ dashboardId, text }) => ({
        method: "POST",
        url: `/api/jev/filters/dashboard/${dashboardId}`,
        body: { text },
      }),
    }),
    getQuestionFilterSlots: builder.mutation<
      JevQuestionSlots,
      JevQuestionSlotsRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/jev/filters/question/slots",
        body,
      }),
    }),
    suggestQuestionFilters: builder.mutation<
      JevFilterSuggestions,
      JevQuestionFilterSuggestionsRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/jev/filters/question",
        body,
      }),
    }),
  }),
});

export const {
  useSuggestDashboardFiltersMutation,
  useGetQuestionFilterSlotsMutation,
  useSuggestQuestionFiltersMutation,
} = jevFiltersApi;
