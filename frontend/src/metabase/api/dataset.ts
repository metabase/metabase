import { updateMetadata } from "metabase/redux/metadata";
import type { Dispatch } from "metabase/redux/store";
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

const getAdhocQueryMetadataDefinition = {
  query: (body: DatasetQuery) => ({
    method: "POST" as const,
    url: "/api/dataset/query_metadata",
    body,
  }),
  providesTags: (metadata: CardQueryMetadata | undefined) =>
    metadata ? provideAdhocQueryMetadataTags(metadata) : [],
  onQueryStarted: (
    _: DatasetQuery,
    {
      queryFulfilled,
      dispatch,
    }: {
      queryFulfilled: Promise<{ data: CardQueryMetadata }>;
      dispatch: Dispatch;
    },
  ) =>
    handleQueryFulfilled(queryFulfilled, (data) =>
      dispatch(updateMetadata(data, QueryMetadataSchema)),
    ),
};

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
    getAdhocQueryMetadata: builder.query<CardQueryMetadata, DatasetQuery>(
      getAdhocQueryMetadataDefinition,
    ),
    getAdhocQueryMetadataCached: builder.query<CardQueryMetadata, DatasetQuery>(
      {
        ...getAdhocQueryMetadataDefinition,
        keepUnusedDataFor: 30 * 60,
      },
    ),
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
  useGetAdhocQueryMetadataCachedQuery,
  useLazyGetAdhocQueryMetadataQuery,
  useGetNativeDatasetQuery,
  useGetRemappedParameterValueQuery,
} = datasetApi;
