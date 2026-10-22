import type { FieldId, TableId } from "metabase-types/api";

import { Api } from "./api";

// Prototype: the response of GET /api/prototype/filter-usage.
export type PrototypeFilterUsage = {
  field_id: FieldId;
  table_id: TableId;
  filter_count: number;
  query_count: number;
  ratio: number;
};

// Prototype: the response of GET /api/prototype/field-categories.
export type PrototypeFieldCategories = {
  table_id: TableId;
  categories: { name: string; field_ids: FieldId[] }[];
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
    }
  | { status: "rejected"; reason: string };

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
    listPrototypeFieldCategories: builder.query<
      PrototypeFieldCategories[],
      void
    >({
      query: () => ({
        method: "GET",
        url: "/api/prototype/field-categories",
      }),
    }),
  }),
});

export const {
  useSuggestPrototypeFilterValuesMutation,
  useSuggestPrototypeFiltersMutation,
  useListPrototypeFilterUsageQuery,
  useListPrototypeFieldCategoriesQuery,
} = prototypeApi;
