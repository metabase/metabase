import type {
  CardQueryMetadata,
  Dataset,
  DatasetQuery,
  FieldValue,
  GetRemappedParameterValueRequest,
  NativeDatasetResponse,
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
    getRemappedParameterValue: builder.query<
      FieldValue,
      GetRemappedParameterValueRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/dataset/parameter/remapping",
        body,
      }),
      providesTags: (_response, _error, { parameter }) =>
        provideParameterValuesTags(parameter.id),
    }),
  }),
});

export const {
  useGetAdhocQueryQuery,
  useGetAdhocQueryMetadataQuery,
  useGetNativeDatasetQuery,
  useGetRemappedParameterValueQuery,
} = datasetApi;
