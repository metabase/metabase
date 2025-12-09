import type {
  CheckCardDependenciesRequest,
  CheckDependenciesResponse,
  CheckSnippetDependenciesRequest,
  CheckTransformDependenciesRequest,
  DependencyGraph,
  DependencyNode,
  GetDependencyGraphRequest,
  ListNodeDependentsRequest,
  ListUnreferencedNodesRequest,
  ListUnreferencedNodesResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  provideDependencyGraphTags,
  provideDependencyNodeListTags,
  provideUnreferencedNodesTags,
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
    listUnreferencedNodes: builder.query<
      ListUnreferencedNodesResponse,
      ListUnreferencedNodesRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/dependencies/unreferenced-items",
        params,
      }),
      providesTags: (response) =>
        response ? provideUnreferencedNodesTags(response) : [],
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
  useListUnreferencedNodesQuery,
  useLazyCheckCardDependenciesQuery,
  useLazyCheckSnippetDependenciesQuery,
  useLazyCheckTransformDependenciesQuery,
} = dependencyApi;
