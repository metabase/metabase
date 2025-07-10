import type { SkipToken } from "@reduxjs/toolkit/query";

import type {
  DataApp,
  DataAppDefinition,
  DataAppDefinitionRelease,
} from "metabase/data-apps/types";
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
    }),

    getDataApp: builder.query<DataApp, { id: string }>({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/data-app/${id}`,
      }),
    }),

    createDataApp: builder.mutation<DataApp, CreateDataAppRequest>({
      query: (params) => ({
        method: "POST",
        url: `/api/data-app/`,
        params,
      }),
    }),

    updateDataApp: builder.mutation<DataApp, UpdateDataAppRequest>({
      query: ({ id, ...bodyParams }) => ({
        method: "PUT",
        url: `/api/data-app/${id}`,
        body: bodyParams,
      }),
    }),

    archiveDataApp: builder.mutation<void, { id: string }>({
      query: ({ id }) => ({
        method: "POST",
        url: `/api/data-app/${id}`,
      }),
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
    }),

    releaseDataAppDefinition: builder.mutation<
      DataAppDefinitionRelease,
      { id: string }
    >({
      query: ({ id }) => ({
        method: "POST",
        url: `/api/data-app/${id}/release`,
      }),
    }),
  }),
});

export const {
  useGetDataAppsQuery,
  useGetDataAppQuery,
  useCreateDataAppMutation,
  useUpdateDataAppMutation,
  useUpdateDataAppDefinitionMutation,
  useReleaseDataAppDefinitionMutation,
} = dataAppsApi;
