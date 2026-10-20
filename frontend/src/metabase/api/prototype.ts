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

export const prototypeApi = Api.injectEndpoints({
  endpoints: (builder) => ({
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
  useListPrototypeFilterUsageQuery,
  useListPrototypeFieldCategoriesQuery,
} = prototypeApi;
