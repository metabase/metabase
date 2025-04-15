import type {
  CardQueryMetadata,
  Dataset,
  DatasetQuery,
  GetParameterValuesRequest,
  GetParameterValuesResponse,
  NativeDatasetResponse,
  SearchParameterValuesRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  provideAdhocQueryMetadataTags,
  provideParameterValuesTags,
} from "./tags";

export const datasetApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getAdhocQuery: builder.query<Dataset, DatasetQuery>({
      query: (body) => ({
        method: "POST",
        url: "/api/dataset",
        body,
      }),
    }),
    getAdhocQueryMetadata: builder.query<CardQueryMetadata, DatasetQuery>({
      query: (body) => ({
        method: "POST",
        url: "/api/dataset/query_metadata",
        body,
      }),
      providesTags: (metadata) =>
        metadata ? provideAdhocQueryMetadataTags(metadata) : [],
    }),
    getNativeDataset: builder.query<NativeDatasetResponse, DatasetQuery>({
      query: (body) => ({
        method: "POST",
        url: "/api/dataset/native",
        body,
      }),
    }),
    getParameterValues: builder.query<
      GetParameterValuesResponse,
      GetParameterValuesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/dataset/parameter/values",
        body,
      }),
      providesTags: (_data, _error, { parameter }) =>
        provideParameterValuesTags(parameter.id),
    }),
    searchParameterValues: builder.query<
      GetParameterValuesResponse,
      SearchParameterValuesRequest
    >({
      query: ({ query, ...body }) => ({
        method: "POST",
        url: `/api/dataset/parameter/search/${encodeURIComponent(query)}`,
        body,
      }),
      providesTags: (_data, _error, { parameter }) =>
        provideParameterValuesTags(parameter.id),
    }),
  }),
});

export const {
  useGetAdhocQueryQuery,
  useGetAdhocQueryMetadataQuery,
  useGetNativeDatasetQuery,
  useGetParameterValuesQuery,
  useLazyGetParameterValuesQuery,
  useSearchParameterValuesQuery,
  useLazySearchParameterValuesQuery,
} = datasetApi;
