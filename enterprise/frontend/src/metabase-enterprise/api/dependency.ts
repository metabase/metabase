import type {
  CheckCardDependenciesRequest,
  CheckDependenciesResponse,
  CheckTransformDependenciesRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const dependencyApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    checkCardDependencies: builder.query<
      CheckDependenciesResponse,
      CheckCardDependenciesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/dependencies/check_card",
        body,
      }),
    }),
    checkTransformDependencies: builder.query<
      CheckDependenciesResponse,
      CheckTransformDependenciesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/dependencies/check_transform",
        body,
      }),
    }),
  }),
});

export const {
  useLazyCheckCardDependenciesQuery,
  useLazyCheckTransformDependenciesQuery,
} = dependencyApi;
