import type {
  AnalyzeCardUpdateRequest,
  AnalyzeCardUpdateResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const dependencyApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    analyzeCardUpdate: builder.mutation<
      AnalyzeCardUpdateResponse,
      AnalyzeCardUpdateRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/dependency/analyze-card-update",
        body,
      }),
    }),
  }),
});

export const { useAnalyzeCardUpdateMutation } = dependencyApi;
