import { updateMetadata } from "metabase/lib/redux/metadata";
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

export const datasetApi = Api.injectEndpoints({
  endpoints: (builder) => ({
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
  useGetAdhocQueryQuery,
  useLazyGetAdhocQueryQuery,
  useGetAdhocPivotQueryQuery,
  useGetAdhocQueryMetadataQuery,
  useLazyGetAdhocQueryMetadataQuery,
  useGetNativeDatasetQuery,
  useGetRemappedParameterValueQuery,
} = datasetApi;
