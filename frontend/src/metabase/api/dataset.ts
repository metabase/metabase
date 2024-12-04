import type {
  CardQueryMetadata,
  Dataset,
  DatasetQuery,
  NativeQueryForm,
} from "metabase-types/api";

import { Api } from "./api";
import { provideAdhocQueryMetadataTags } from "./tags";

export const datasetApi = Api.injectEndpoints({
  endpoints: builder => ({
    getAdhocQuery: builder.query<Dataset, DatasetQuery>({
      query: body => ({
        method: "POST",
        url: "/api/dataset",
        body,
      }),
    }),
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
  }),
});

export const {
  useGetAdhocQueryQuery,
  useGetAdhocQueryMetadataQuery,
  useGetNativeDatasetQuery,
} = datasetApi;
