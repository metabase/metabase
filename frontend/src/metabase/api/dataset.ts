import type {
  NativeQueryForm,
  DatasetQuery,
  CardQueryMetadata,
  StructuredDatasetQuery,
} from "metabase-types/api";

import { Api } from "./api";
import { provideAdhocQueryMetadataTags } from "./tags";

export const datasetApi = Api.injectEndpoints({
  endpoints: builder => ({
    getAdhocQueryMetadata: builder.query<CardQueryMetadata, DatasetQuery>({
      query: body => ({
        method: "POST",
        url: "/api/dataset/query_metadata",
        body,
      }),
      providesTags: metadata =>
        metadata ? provideAdhocQueryMetadataTags(metadata) : [],
    }),
    getNativeDataset: builder.query<NativeQueryForm, DatasetQuery>({
      query: body => ({
        method: "POST",
        url: "/api/dataset/native",
        body,
      }),
    }),
    getDataset: builder.query<any, StructuredDatasetQuery>({
      query: body => ({
        method: "POST",
        url: "/api/dataset",
        body,
      }),
      transformResponse: (response) => response,
      providesTags: () => [{ type: 'card' as const, id: 'LIST' }],
    }),
  }),
});

export const { useGetAdhocQueryMetadataQuery, useGetNativeDatasetQuery, useGetDatasetQuery } =
  datasetApi;
