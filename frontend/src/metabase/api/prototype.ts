import type { CardId, FieldId, TableId } from "metabase-types/api";

import { Api } from "./api";

// Prototype: the response of GET /api/prototype/filter-usage.
export type PrototypeFilterUsage = {
  field_id: FieldId;
  table_id: TableId;
  filter_count: number;
  query_count: number;
  ratio: number;
};

// Prototype: the request and the response of POST /api/prototype/filter-values.
export type PrototypeFilterValuesRequest = {
  prompt: string;
  field_id: FieldId | null;
  table_name: string;
  column_name: string;
  operator: string;
  value_kind: "single" | "range" | "multi";
  values: string[];
  options?: string[];
};

export type PrototypeFilterValuesResponse =
  | { status: "ok"; values: string[] }
  | { status: "rejected"; reason: string };

// Prototype: the request and the response of POST /api/prototype/filters.
export type PrototypeAiValueKind =
  | "none"
  | "single"
  | "range"
  | "multi"
  | "amount-unit"
  | "unit";

export type PrototypeFiltersRequest = {
  prompt: string;
  today: string;
  columns: {
    id: number;
    table: string;
    name: string;
    kind: "string" | "number" | "boolean" | "date";
    field_id: FieldId | null;
    operators: {
      key: string;
      label: string;
      value_kind: PrototypeAiValueKind;
      options?: string[];
    }[];
  }[];
};

export type PrototypeFiltersResponse =
  | {
      status: "ok";
      filters: { column: number; operator: string; values: string[] }[];
      /** How the filters combine, like "0 or (1 and 2)". All AND without it. */
      logic?: string;
    }
  | { status: "rejected"; reason: string };

// Prototype: the request and the response of GET /api/prototype/runtime-estimate.
export type PrototypeRuntimeEstimateRequest = {
  "card-id"?: CardId;
  "table-id"?: TableId;
};

export type PrototypeRuntimeEstimate =
  | {
      basis: "question" | "table";
      run_count: number;
      days: number;
      p50_ms: number;
      p90_ms: number;
    }
  | { basis: null };

export const prototypeApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    suggestPrototypeFilterValues: builder.mutation<
      PrototypeFilterValuesResponse,
      PrototypeFilterValuesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/prototype/filter-values",
        body,
      }),
    }),
    suggestPrototypeFilters: builder.mutation<
      PrototypeFiltersResponse,
      PrototypeFiltersRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/prototype/filters",
        body,
      }),
    }),
    listPrototypeFilterUsage: builder.query<PrototypeFilterUsage[], void>({
      query: () => ({
        method: "GET",
        url: "/api/prototype/filter-usage",
      }),
    }),
    getPrototypeRuntimeEstimate: builder.query<
      PrototypeRuntimeEstimate,
      PrototypeRuntimeEstimateRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/prototype/runtime-estimate",
        params,
      }),
    }),
  }),
});

export const {
  useSuggestPrototypeFilterValuesMutation,
  useSuggestPrototypeFiltersMutation,
  useListPrototypeFilterUsageQuery,
  useGetPrototypeRuntimeEstimateQuery,
} = prototypeApi;
