import { match } from "ts-pattern";
import _ from "underscore";

import type { ExportFormat } from "metabase/common/types/export";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { updateMetadata } from "metabase/redux/metadata";
import { QueryMetadataSchema } from "metabase/schema";
import type {
  CardId,
  CardQueryMetadata,
  DashCardId,
  DashboardId,
  Dataset,
  DatasetQuery,
  DocumentId,
  FieldValue,
  GetRemappedParameterValueRequest,
  InternalDatasetQuery,
  JsonQuery,
  NativeDatasetResponse,
  NormalizedQueryParameter,
  VisualizationSettings,
} from "metabase-types/api";
import type { EntityToken, EntityUuid } from "metabase-types/api/entity";

import { Api, type RtkCacheKeyed } from "./api";
import {
  provideAdhocDatasetTags,
  provideAdhocQueryMetadataTags,
  provideParameterValuesTags,
} from "./tags";
import { handleQueryFulfilled } from "./utils/lifecycle";

interface IgnorableError {
  ignore_error?: boolean;
}

type DownloadDatasetResource =
  | {
      resourceType: "question";
      accessedVia: "internal";
      cardId: CardId;
      parameters: NormalizedQueryParameter[];
    }
  | {
      resourceType: "question";
      accessedVia: "public-link";
      uuid: EntityUuid;
      parameters: NormalizedQueryParameter[];
    }
  | {
      resourceType: "question";
      accessedVia: "static-embed";
      token: EntityToken;
      parameterValues: Record<string, unknown>;
    }
  | {
      resourceType: "dashcard";
      accessedVia: "internal" | "public-link";
      dashboardId: DashboardId;
      dashcardId: DashCardId;
      cardId: CardId;
      parameters: NormalizedQueryParameter[];
    }
  | {
      resourceType: "dashcard";
      accessedVia: "static-embed";
      token: EntityToken;
      dashcardId: DashCardId;
      cardId: CardId;
      parameterValues: Record<string, unknown>;
    }
  | {
      resourceType: "document-card";
      accessedVia: "internal";
      documentId: DocumentId;
      cardId: CardId;
      parameters: NormalizedQueryParameter[];
    }
  | {
      resourceType: "document-card";
      accessedVia: "public-link";
      documentUuid: EntityUuid;
      cardId: CardId;
      parameters: NormalizedQueryParameter[];
    }
  | {
      resourceType: "ad-hoc-question";
      query: JsonQuery | undefined;
      visualizationSettings: VisualizationSettings;
    };

export type DownloadDatasetArgs = DownloadDatasetResource & {
  format: ExportFormat;
  format_rows: boolean;
  pivot_results: boolean;
};

type DownloadDatasetRequest =
  | { method: "POST"; url: string; body: Record<string, unknown> }
  | { method: "GET"; url: string; queryParams: URLSearchParams };

const convertSearchParamsToObject = (params: URLSearchParams) => {
  const object: Record<string, string | string[]> = {};
  for (const [key, value] of params.entries()) {
    const existing = object[key];
    object[key] = existing == null ? value : [existing, value].flat();
  }

  return object;
};

const getDownloadDatasetRequest = ({
  format,
  format_rows,
  pivot_results,
  ...resource
}: DownloadDatasetArgs): DownloadDatasetRequest => {
  const exportParams = {
    format_rows,
    pivot_results,
    csv_include_bom: true,
  };
  const exportQueryParams = _.mapObject(exportParams, (value) => String(value));

  return match(resource)
    .with(
      { resourceType: "question", accessedVia: "internal" },
      ({ cardId, parameters }) => ({
        method: "POST" as const,
        url: `/api/card/${cardId}/query/${format}`,
        body: { parameters, ...exportParams },
      }),
    )
    .with(
      { resourceType: "question", accessedVia: "public-link" },
      ({ uuid, parameters }) => ({
        method: "GET" as const,
        url: `/public/question/${uuid}.${format}`,
        queryParams: new URLSearchParams({
          parameters: JSON.stringify(
            parameters.map(({ id, value }) => ({ id, value })),
          ),
          ...exportQueryParams,
        }),
      }),
    )
    .with(
      { resourceType: "question", accessedVia: "static-embed" },
      ({ token, parameterValues }) => ({
        method: "GET" as const,
        url: `/embed/question/${token}.${format}`,
        queryParams: new URLSearchParams({
          // Guest Embed / Modular embedding SDK embeds receive parameter values via postMessage
          // from the host page, so window.location.search does not reflect the active
          // editable filter state. Fall back to the params provided by the caller.
          // Static embed iframes encode filter values in the iframe URL, so read them
          // from window.location.search.
          parameters: JSON.stringify(
            isEmbeddingSdk()
              ? parameterValues
              : convertSearchParamsToObject(
                  new URLSearchParams(window.location.search),
                ),
          ),
          ...exportQueryParams,
        }),
      }),
    )
    .with(
      { resourceType: "dashcard", accessedVia: "internal" },
      ({ dashboardId, dashcardId, cardId, parameters }) => ({
        method: "POST" as const,
        url: `/api/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${cardId}/query/${format}`,
        body: { parameters, ...exportParams },
      }),
    )
    .with(
      { resourceType: "dashcard", accessedVia: "public-link" },
      ({ dashboardId, dashcardId, cardId, parameters }) => ({
        method: "POST" as const,
        url: `/api/public/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${cardId}/${format}`,
        body: { parameters, ...exportParams },
      }),
    )
    .with(
      { resourceType: "dashcard", accessedVia: "static-embed" },
      ({ token, dashcardId, cardId, parameterValues }) => ({
        method: "GET" as const,
        url: `/api/embed/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}/${format}`,
        queryParams: new URLSearchParams({
          parameters: JSON.stringify(parameterValues),
          ...exportQueryParams,
        }),
      }),
    )
    .with(
      { resourceType: "document-card", accessedVia: "internal" },
      ({ documentId, cardId, parameters }) => ({
        method: "POST" as const,
        url: `/api/document/${documentId}/card/${cardId}/query/${format}`,
        body: { parameters, ...exportParams },
      }),
    )
    .with(
      { resourceType: "document-card", accessedVia: "public-link" },
      ({ documentUuid, cardId, parameters }) => ({
        method: "POST" as const,
        url: `/api/public/document/${documentUuid}/card/${cardId}/${format}`,
        body: { parameters, ...exportParams },
      }),
    )
    .with(
      { resourceType: "ad-hoc-question" },
      ({ query, visualizationSettings }) => ({
        method: "POST" as const,
        url: `/api/dataset/${format}`,
        body: {
          query: _.omit(query ?? {}, "constraints"),
          visualization_settings: visualizationSettings,
          ...exportParams,
        },
      }),
    )
    .exhaustive();
};

export const datasetApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    downloadDataset: builder.mutation<Response, DownloadDatasetArgs>({
      query: (args) => {
        const request = getDownloadDatasetRequest(args);
        if (request.method === "POST") {
          // BE expects the body to be form-encoded :(
          const formData = new URLSearchParams();
          for (const key in request.body) {
            formData.append(key, JSON.stringify(request.body[key]));
          }
          return {
            method: "POST",
            url: request.url,
            body: formData,
            rawResponse: true,
          };
        }
        return {
          method: "GET",
          url: `${request.url}?${request.queryParams}`,
          rawResponse: true,
        };
      },
    }),
    getAdhocQuery: builder.query<
      Dataset,
      (DatasetQuery | InternalDatasetQuery) & RtkCacheKeyed & IgnorableError
    >({
      query: ({ ignore_error, ...body }) => ({
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
      } & RtkCacheKeyed &
        IgnorableError
    >({
      query: ({ ignore_error, ...body }) => ({
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
