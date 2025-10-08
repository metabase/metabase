import { Api } from "./api";

export const storeApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listPlans: builder.query<unknown, void>({
      query: () => ({
        method: "GET",
        url: "/api/store-api/plan",
      }),
    }),
    listAddons: builder.query<unknown, void>({
      query: () => ({
        method: "GET",
        url: "/api/store-api/addons",
      }),
    }),
  }),
});

export const { useListPlansQuery, useListAddonsQuery } = storeApi;
