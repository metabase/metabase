import * as Lib from "metabase-lib";
import type {
  CardQueryMetadata,
  Dataset,
  DatasetQuery,
  FieldValue,
  GetRemappedParameterValueRequest,
  InternalDatasetQuery,
  JsonQuery,
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

/**
 * Names the Metabot reply that a chart's query run belongs to. It goes to the
 * server in request headers, for the record of the run, not in the query.
 */
export type MetabotChartRun = {
  conversation_id: string;
  /** The external id of the assistant message that holds the chart. */
  message_id?: string;
  /** Whether this is a later run of the chart, not its first. */
  rerun: boolean;
};

interface MetabotChartRunArg {
  metabot_run?: MetabotChartRun;
}

/* eslint-disable metabase/no-literal-metabase-strings -- request header names */
const METABOT_CONVERSATION_ID_HEADER = "X-Metabase-Metabot-Conversation-Id";
const METABOT_MESSAGE_ID_HEADER = "X-Metabase-Metabot-Message-Id";
const METABOT_RERUN_HEADER = "X-Metabase-Metabot-Rerun";
/* eslint-enable metabase/no-literal-metabase-strings */

const getMetabotChartRunHeaders = ({
  conversation_id,
  message_id,
  rerun,
}: MetabotChartRun): Record<string, string> => ({
  [METABOT_CONVERSATION_ID_HEADER]: conversation_id,
  ...(message_id ? { [METABOT_MESSAGE_ID_HEADER]: message_id } : {}),
  [METABOT_RERUN_HEADER]: String(rerun),
});

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
      (JsonQuery | InternalDatasetQuery) &
        RtkCacheKeyed &
        IgnorableError &
        MetabotChartRunArg
    >({
      query: ({ ignore_error, metabot_run, ...body }) => ({
        method: "POST",
        url: "/api/dataset",
        body,
        headers: metabot_run
          ? getMetabotChartRunHeaders(metabot_run)
          : undefined,
        noEvent: ignore_error,
      }),
      serializeQueryArgs: ({ queryArgs }) =>
        Lib.canonicalizeLibUuids(queryArgs),
      providesTags: () => provideAdhocDatasetTags(),
      // Dataset results can be large, so evict immediately on unsubscribe
      // to match the legacy fetch-and-discard behavior used by the
      // imperative `runAdhocDatasetQuery` runner. Callers subscribed at
      // the same time still share an entry when their queries differ only
      // in Lib UUIDs (see `serializeQueryArgs`).
      keepUnusedDataFor: 0,
    }),
    getAdhocPivotQuery: builder.query<
      Dataset,
      JsonQuery & {
        pivot_rows?: number[];
        pivot_cols?: number[];
        show_row_totals?: boolean;
        show_column_totals?: boolean;
      } & RtkCacheKeyed &
        IgnorableError
    >({
      query: ({ ignore_error, ...body }) => ({
        method: "POST",
        url: "/api/dataset/pivot",
        body,
        noEvent: ignore_error,
      }),
      serializeQueryArgs: ({ queryArgs }) =>
        Lib.canonicalizeLibUuids(queryArgs),
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
    }),
    getNativeDataset: builder.query<NativeDatasetResponse, JsonQuery>({
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
