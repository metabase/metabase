import { isEmbeddingMcpApp } from "metabase/embedding-sdk/config";
import {
  getCurrentMcpQueryHandle,
  refreshMcpCredential,
} from "metabase/embedding-sdk/mcp-app-queries";
import type {
  CardQueryMetadata,
  Dataset,
  DatasetQuery,
  FieldValue,
  GetRemappedParameterValueRequest,
  InternalDatasetQuery,
  NativeDatasetResponse,
} from "metabase-types/api";

import { Api, type RtkCacheKeyed } from "./api";
import {
  provideAdhocDatasetTags,
  provideAdhocQueryMetadataTags,
  provideParameterValuesTags,
} from "./tags";

interface IgnorableError {
  ignore_error?: boolean;
}

/** The MCP App iframe's handle-keyed route that stands in for an ad-hoc dataset route. */
type McpAppQueryRoute =
  | "run"
  | "pivot"
  | "query_metadata"
  | "parameter/remapping";

type DatasetRequestResult = { data?: unknown; error?: unknown };

function getMcpAppQueryUrl(url: string, route: McpAppQueryRoute): string {
  const handle = getCurrentMcpQueryHandle();

  return handle
    ? `/api/embed-mcp/queries/${encodeURIComponent(handle)}/${route}`
    : url;
}

function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 401
  );
}

async function renewMcpCredential(): Promise<boolean> {
  try {
    await refreshMcpCredential();
    return true;
  } catch (error) {
    console.error("Error refreshing the MCP UI credential", error);
    return false;
  }
}

/**
 * Send an ad-hoc dataset request to `url` with `send`. In the MCP App iframe,
 * which runs only stored queries, the request goes to the current query
 * handle's `route` instead, and is sent once more with a fresh credential when
 * that route refuses the current one.
 */
async function sendDatasetRequest(
  url: string,
  route: McpAppQueryRoute,
  signal: AbortSignal,
  send: (
    url: string,
  ) => DatasetRequestResult | PromiseLike<DatasetRequestResult>,
): Promise<DatasetRequestResult> {
  if (!isEmbeddingMcpApp()) {
    return send(url);
  }

  const result = await send(getMcpAppQueryUrl(url, route));

  if (!isUnauthorized(result.error) || signal.aborted) {
    return result;
  }

  const isRenewed = await renewMcpCredential();

  return isRenewed && !signal.aborted
    ? send(getMcpAppQueryUrl(url, route))
    : result;
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
      (DatasetQuery | InternalDatasetQuery) & RtkCacheKeyed & IgnorableError
    >({
      queryFn: async (
        { ignore_error, ...body },
        { signal },
        _extraOptions,
        baseQuery,
      ) => {
        const { data, error } = await sendDatasetRequest(
          "/api/dataset",
          "run",
          signal,
          (url) =>
            baseQuery({ method: "POST", url, body, noEvent: ignore_error }),
        );
        // Both routes this can reach answer with a Dataset.
        return error !== undefined ? { error } : { data: data as Dataset };
      },
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
      } & RtkCacheKeyed &
        IgnorableError
    >({
      queryFn: async (
        { ignore_error, ...body },
        { signal },
        _extraOptions,
        baseQuery,
      ) => {
        const { data, error } = await sendDatasetRequest(
          "/api/dataset/pivot",
          "pivot",
          signal,
          (url) =>
            baseQuery({ method: "POST", url, body, noEvent: ignore_error }),
        );
        // Both routes this can reach answer with a Dataset.
        return error !== undefined ? { error } : { data: data as Dataset };
      },
      providesTags: () => provideAdhocDatasetTags(),
      keepUnusedDataFor: 0,
    }),
    getAdhocQueryMetadata: builder.query<CardQueryMetadata, DatasetQuery>({
      queryFn: async (body, { signal }, _extraOptions, baseQuery) => {
        const { data, error } = await sendDatasetRequest(
          "/api/dataset/query_metadata",
          "query_metadata",
          signal,
          (url) => baseQuery({ method: "POST", url, body }),
        );
        // Both routes this can reach answer with the query's metadata.
        return error !== undefined
          ? { error }
          : { data: data as CardQueryMetadata };
      },
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
      queryFn: async (body, { signal }, _extraOptions, baseQuery) => {
        const { data, error } = await sendDatasetRequest(
          "/api/dataset/parameter/remapping",
          "parameter/remapping",
          signal,
          (url) => baseQuery({ method: "POST", url, body }),
        );
        // Both routes this can reach answer with the remapped value.
        return error !== undefined ? { error } : { data: data as FieldValue };
      },
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
