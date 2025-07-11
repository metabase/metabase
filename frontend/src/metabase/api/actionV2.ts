import type {
  DatabaseId,
  DatabasesWithActionsResponse,
  ListActionsRequestParams,
  ListActionsResponse,
  ModelsWithActionsResponse,
  TablesWithActionsResponse,
} from "metabase-types/api";

import { Api } from "./api";

export const actionV2Api = Api.injectEndpoints({
  endpoints: (builder) => ({
    listModelsWithActions: builder.query<ModelsWithActionsResponse, void>({
      query: () => ({
        method: "GET",
        url: `/api/action/v2/model`,
      }),
    }),
    listDatabasesWithActions: builder.query<DatabasesWithActionsResponse, void>(
      {
        query: () => ({
          method: "GET",
          url: `/api/action/v2/database`,
        }),
      },
    ),
    listDatabaseTablesWithActions: builder.query<
      TablesWithActionsResponse,
      { id: DatabaseId }
    >({
      query: (params) => ({
        method: "GET",
        url: `/api/action/v2/database/:id/table`,
        params,
      }),
    }),
    listActionsV2: builder.query<ListActionsResponse, ListActionsRequestParams>(
      {
        query: (params) => ({
          method: "GET",
          url: `/api/action/v2/`,
          params,
        }),
      },
    ),
  }),
});

export const {
  useListModelsWithActionsQuery,
  useListDatabasesWithActionsQuery,
  useListDatabaseTablesWithActionsQuery,
  useListActionsV2Query,
} = actionV2Api;
