import type {
  CheckCardDependenciesRequest,
  CheckDependenciesResponse,
  CheckSnippetDependenciesRequest,
  CheckTransformDependenciesRequest,
  DependencyGraph,
  DependencyNode,
  GetDependencyGraphRequest,
  ListBreakingGraphNodesRequest,
  ListBreakingGraphNodesResponse,
  ListBrokenGraphNodesRequest,
  ListNodeDependentsRequest,
  ListUnreferencedGraphNodesRequest,
  ListUnreferencedGraphNodesResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  provideDependencyGraphTags,
  provideDependencyNodeListTags,
} from "./tags";

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
      providesTags: (graph) => (graph ? provideDependencyGraphTags(graph) : []),
    }),
    listNodeDependents: builder.query<
      DependencyNode[],
      ListNodeDependentsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/dependencies/graph/dependents",
        params,
      }),
      providesTags: (nodes) =>
        nodes ? provideDependencyNodeListTags(nodes) : [],
    }),
    listBreakingGraphNodes: builder.query<
      ListBreakingGraphNodesResponse,
      ListBreakingGraphNodesRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/dependencies/graph/breaking",
        params,
      }),
      providesTags: (response) =>
        response ? provideDependencyNodeListTags(response.data) : [],
    }),
    listBrokenGraphNodes: builder.query<
      DependencyNode[],
      ListBrokenGraphNodesRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/dependencies/graph/broken",
        params,
      }),
      providesTags: (nodes) =>
        nodes ? provideDependencyNodeListTags(nodes) : [],
    }),
    listUnreferencedGraphNodes: builder.query<
      ListUnreferencedGraphNodesResponse,
      ListUnreferencedGraphNodesRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/dependencies/graph/unreferenced",
        params,
      }),
      providesTags: (response) =>
        response ? provideDependencyNodeListTags(response.data) : [],
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
  useListNodeDependentsQuery,
  useListBreakingGraphNodesQuery,
  useListBrokenGraphNodesQuery,
  useListUnreferencedGraphNodesQuery,
  useLazyCheckCardDependenciesQuery,
  useLazyCheckSnippetDependenciesQuery,
  useLazyCheckTransformDependenciesQuery,
} = dependencyApi;
