import type {
  CheckCardUpdateRequest,
  CheckCardUpdateResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const dependencyApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    checkCardUpdate: builder.query<
      CheckCardUpdateResponse,
      CheckCardUpdateRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/dependency/analyze-card-update",
        body,
      }),
    }),
  }),
});

export const { useLazyCheckCardUpdateQuery } = dependencyApi;
