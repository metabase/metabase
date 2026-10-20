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

export const prototypeApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listPrototypeFilterUsage: builder.query<PrototypeFilterUsage[], void>({
      query: () => ({
        method: "GET",
        url: "/api/prototype/filter-usage",
      }),
    }),
  }),
});

export const { useListPrototypeFilterUsageQuery } = prototypeApi;
