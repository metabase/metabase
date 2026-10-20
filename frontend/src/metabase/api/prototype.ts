import type {
  FieldId,
  LegacyDatasetQuery,
  OpaqueDatasetQuery,
  TableId,
} from "metabase-types/api";

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

// Prototype: POST /api/metabot/prototype-filters.
export type PrototypeFiltersRequest = {
  query: LegacyDatasetQuery;
  message: string;
};

export type PrototypeFiltersResponse =
  | { query: OpaqueDatasetQuery; error?: undefined }
  | { query?: undefined; error: string };

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
    buildPrototypeFilters: builder.mutation<
      PrototypeFiltersResponse,
      PrototypeFiltersRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/metabot/prototype-filters",
        body,
      }),
    }),
  }),
});

export const {
  useListPrototypeFilterUsageQuery,
  useListPrototypeFieldCategoriesQuery,
  useBuildPrototypeFiltersMutation,
} = prototypeApi;
