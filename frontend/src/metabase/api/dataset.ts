import { updateMetadata } from "metabase/redux/metadata";
import { QueryMetadataSchema } from "metabase/schema";
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
  provideAdhocDatasetTags,
  provideAdhocQueryMetadataTags,
  provideParameterValuesTags,
} from "./tags";
import { handleQueryFulfilled } from "./utils/lifecycle";

interface RefetchDeps {
  /**
   * This attribute won't be a part of the API request and can be used to invalidate
   * the cache of a given RTK query using its built-in caching mechanism.
   */
  _refetchDeps?: unknown;
}

interface IgnorableError {
  ignore_error?: boolean;
}

export type DownloadDatasetArgs = {
  method: "GET" | "POST";
  url: string;
  body?: Record<string, unknown>;
};

export const datasetApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    downloadDataset: builder.mutation<Response, DownloadDatasetArgs>({
      query: ({ method, url, body }) => {
        if (method === "POST") {
          // BE expects the body to be form-encoded :(
          const formData = new URLSearchParams();
          if (body != null) {
            for (const key in body) {
              formData.append(key, JSON.stringify(body[key]));
            }
          }
          return {
            method: "POST",
            url,
            body: formData,
            rawResponse: true,
          };
        }
        return {
          method: "GET",
          url,
          rawResponse: true,
        };
      },
    }),
    getAdhocQuery: builder.query<
      Dataset,
      DatasetQuery & RefetchDeps & IgnorableError
    >({
      query: ({ _refetchDeps, ignore_error, ...body }) => ({
        method: "POST",
        url: "/api/dataset",
        body,
        noEvent: ignore_error,
      }),
      providesTags: () => provideAdhocDatasetTags(),
      // Dataset results can be large and the cache key is the full
      // DatasetQuery, so cross-caller cache hits are rare. Evict
      // immediately on unsubscribe to match the legacy fetch-and-discard
      // behavior used by the imperative `runAdhocDatasetQuery` runner.
      keepUnusedDataFor: 0,
    }),
    getAdhocPivotQuery: builder.query<
      Dataset,
      DatasetQuery & {
        pivot_rows?: number[];
        pivot_cols?: number[];
        show_row_totals?: boolean;
        show_column_totals?: boolean;
      } & RefetchDeps &
        IgnorableError
    >({
      query: ({ _refetchDeps, ignore_error, ...body }) => ({
        method: "POST",
        url: "/api/dataset/pivot",
        body,
        noEvent: ignore_error,
      }),
      providesTags: () => provideAdhocDatasetTags(),
      keepUnusedDataFor: 0,
    }),
    getAdhocQueryMetadata: builder.query<CardQueryMetadata, DatasetQuery>({
      query: (body) => ({
        method: "POST",
        url: "/api/dataset/query_metadata",
        body,
      }),
      providesTags: (metadata) =>
        metadata ? provideAdhocQueryMetadataTags(metadata) : [],
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, QueryMetadataSchema)),
        ),
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
  useDownloadDatasetMutation,
  useGetAdhocQueryQuery,
  useLazyGetAdhocQueryQuery,
  useGetAdhocPivotQueryQuery,
  useGetAdhocQueryMetadataQuery,
  useLazyGetAdhocQueryMetadataQuery,
  useGetNativeDatasetQuery,
  useGetRemappedParameterValueQuery,
} = datasetApi;
