import type { AnalysisInput, DatasetQuery } from "metabase-types/api";

import { Api } from "./api";

export const productAnalyticsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    compileAnalysis: builder.query<DatasetQuery, AnalysisInput>({
      query: (body) => ({
        method: "POST",
        url: "/api/product-analytics/compile",
        body,
      }),
    }),
  }),
});

export const { useCompileAnalysisQuery } = productAnalyticsApi;
