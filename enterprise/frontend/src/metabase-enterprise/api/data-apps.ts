import type { SkipToken } from "@reduxjs/toolkit/query";

import type {
  DataApp,
  DataAppDefinition,
  DataAppDefinitionRelease,
} from "metabase/data-apps/types";
import { idTag, listTag } from "metabase-enterprise/api/tags";
import type {
  CreateDataAppRequest,
  DataAppsListResponse,
  UpdateDataAppDefinitionRequest,
  UpdateDataAppRequest,
} from "metabase-enterprise/data-apps/types";
import type { PaginationRequest } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const dataAppsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDataApps: builder.query<
      DataAppsListResponse,
      PaginationRequest | SkipToken | void
    >({
      query: () => ({
        method: "GET",
        url: `/api/data-app/`,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.data?.map(({ id }) => idTag("data-app", id)),
              listTag("data-app"),
            ]
          : [listTag("data-app")],
    }),

    getDataApp: builder.query<DataApp, { id: string }>({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/data-app/${id}`,
      }),
      providesTags: (_result, _error, arg) => [idTag("data-app", arg.id)],
    }),

    createDataApp: builder.mutation<DataApp, CreateDataAppRequest>({
      query: (params) => ({
        method: "POST",
        url: `/api/data-app/`,
        params,
      }),
      invalidatesTags: [listTag("data-app")],
    }),

    updateDataApp: builder.mutation<DataApp, UpdateDataAppRequest>({
      query: ({ id, ...bodyParams }) => ({
        method: "PUT",
        url: `/api/data-app/${id}`,
        body: bodyParams,
      }),
      invalidatesTags: (_result, _error, arg) => [idTag("data-app", arg.id)],
    }),

    archiveDataApp: builder.mutation<void, { id: string }>({
      query: ({ id }) => ({
        method: "DELETE",
        url: `/api/data-app/${id}`,
      }),
      invalidatesTags: (_result, _error, arg) => [idTag("data-app", arg.id)],
    }),

    updateDataAppDefinition: builder.mutation<
      DataAppDefinition,
      UpdateDataAppDefinitionRequest
    >({
      query: ({ id, config }) => ({
        method: "PUT",
        url: `/api/data-app/${id}/definition`,
        body: {
          config,
        },
      }),
      invalidatesTags: (_result, _error, arg) => [idTag("data-app", arg.id)],
    }),

    releaseDataAppDefinition: builder.mutation<
      DataAppDefinitionRelease,
      { id: string }
    >({
      query: ({ id }) => ({
        method: "POST",
        url: `/api/data-app/${id}/release`,
      }),
      invalidatesTags: (_result, _error, arg) => [idTag("data-app", arg.id)],
    }),
  }),
});

export const {
  useGetDataAppsQuery,
  useGetDataAppQuery,
  useCreateDataAppMutation,
  useUpdateDataAppMutation,
  useArchiveDataAppMutation,
  useUpdateDataAppDefinitionMutation,
  useReleaseDataAppDefinitionMutation,
} = dataAppsApi;
