import { Api } from "metabase/api/api";
import type { DataApp } from "metabase/data-apps/types";

export const dataAppsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getPublicDataApp: builder.query<DataApp, { slug: string }>({
      query: ({ slug }) => ({
        method: "GET",
        url: `/api/app/${slug}`,
      }),
    }),
  }),
});

export const { useGetPublicDataAppQuery } = dataAppsApi;
