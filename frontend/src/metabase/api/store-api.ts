import type {
  MetabaseAddonsResponse,
  MetabasePlansResponse,
} from "metabase-types/api";

import { Api } from "./api";

export const storeApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listPlans: builder.query<MetabasePlansResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/store-api/plan",
      }),
    }),
    listAddons: builder.query<MetabaseAddonsResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/store-api/addons",
      }),
    }),
  }),
});

export const { useListPlansQuery, useListAddonsQuery } = storeApi;
