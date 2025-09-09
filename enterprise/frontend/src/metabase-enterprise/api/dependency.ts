import type {
  CheckCardDependenciesRequest,
  CheckCardDependenciesResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const dependencyApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    checkCardDependencies: builder.query<
      CheckCardDependenciesResponse,
      CheckCardDependenciesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/dependencies/check_card",
        body,
      }),
    }),
  }),
});

export const { useLazyCheckCardDependenciesQuery } = dependencyApi;
