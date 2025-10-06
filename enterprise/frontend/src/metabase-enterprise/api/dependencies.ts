import type {
  CheckCardDependenciesRequest,
  CheckDependenciesResponse,
  CheckSnippetDependenciesRequest,
  CheckTransformDependenciesRequest,
  DependencyGraph,
  DependencyGraphNode,
  GetDependencyGraphRequest,
  GetDependencyNodeRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const dependencyApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDependencyGraph: builder.query<
      DependencyGraph,
      GetDependencyGraphRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/dependencies/graph",
        params,
      }),
    }),
    getDependencyNode: builder.query<
      DependencyGraphNode,
      GetDependencyNodeRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/dependencies/graph/node",
        params,
      }),
    }),
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
    checkSnippetDependencies: builder.query<
      CheckDependenciesResponse,
      CheckSnippetDependenciesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/dependencies/check_snippet",
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
  useGetDependencyGraphQuery,
  useGetDependencyNodeQuery,
  useLazyCheckCardDependenciesQuery,
  useLazyCheckSnippetDependenciesQuery,
  useLazyCheckTransformDependenciesQuery,
} = dependencyApi;
