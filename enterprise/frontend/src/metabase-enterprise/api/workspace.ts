import type {
  CreateWorkspaceRequest,
  TableRemapping,
  UpdateWorkspaceRequest,
  Workspace,
  WorkspaceId,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideWorkspaceListTags,
  provideWorkspaceTags,
} from "./tags";

export const workspaceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listWorkspaces: builder.query<Workspace[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/workspace",
      }),
      providesTags: (workspaces = []) => provideWorkspaceListTags(workspaces),
    }),
    getWorkspace: builder.query<Workspace, WorkspaceId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/${id}`,
      }),
      providesTags: (workspace) =>
        workspace ? provideWorkspaceTags(workspace) : [],
    }),
    createWorkspace: builder.mutation<Workspace, CreateWorkspaceRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/workspace",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("workspace")]),
    }),
    updateWorkspace: builder.mutation<Workspace, UpdateWorkspaceRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/workspace/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
      onQueryStarted: async (
        { id, ...patch },
        { dispatch, queryFulfilled },
      ) => {
        const patchResult = dispatch(
          workspaceApi.util.updateQueryData("getWorkspace", id, (draft) => {
            Object.assign(draft, patch);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
    }),
    deleteWorkspace: builder.mutation<void, WorkspaceId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/workspace/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
    }),
    provisionWorkspace: builder.mutation<Workspace, WorkspaceId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/provision`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
      onQueryStarted: async (id, { dispatch, queryFulfilled }) => {
        const patchResult = dispatch(
          workspaceApi.util.updateQueryData("getWorkspace", id, (draft) => {
            draft.databases = draft.databases.map((database) => ({
              ...database,
              status: "provisioning",
            }));
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
    }),
    unprovisionWorkspace: builder.mutation<Workspace, WorkspaceId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/unprovision`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
      onQueryStarted: async (id, { dispatch, queryFulfilled }) => {
        const patchResult = dispatch(
          workspaceApi.util.updateQueryData("getWorkspace", id, (draft) => {
            draft.databases = draft.databases.map((database) => ({
              ...database,
              status: "unprovisioning",
            }));
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
    }),
    listTableRemappings: builder.query<TableRemapping[], void>({
      // query: () => ({
      //   method: "GET",
      //   url: "/api/ee/table-remapping",
      // }),
      queryFn: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const sourceSchemas = ["public", "raw", "staging", "ingest", "ext"];
        const targetSchemas = [
          "isolated",
          "analytics",
          "marts",
          "warehouse",
          "sandbox",
        ];
        const tableNames = [
          "orders",
          "people",
          "products",
          "events",
          "sessions",
          "invoices",
          "subscriptions",
          "payments",
          "reviews",
          "shipments",
          "inventory",
          "categories",
          "vendors",
          "tickets",
          "campaigns",
          "leads",
          "accounts",
          "transactions",
          "refunds",
          "discounts",
        ];
        const remappings: TableRemapping[] = Array.from(
          { length: 40 },
          (_, index) => {
            const tableName = tableNames[index % tableNames.length];
            const sourceSchema = sourceSchemas[index % sourceSchemas.length];
            const targetSchema = targetSchemas[index % targetSchemas.length];
            const databaseId = (index % 3) + 1;
            const createdAtDay = String((index % 28) + 1).padStart(2, "0");
            return {
              id: index + 1,
              database_id: databaseId,
              from_schema: sourceSchema,
              from_table_name: tableName,
              from_table_id: null,
              to_schema: targetSchema,
              to_table_name: `${tableName}_v${Math.floor(index / tableNames.length) + 1}`,
              to_table_id: null,
              created_at: `2026-04-${createdAtDay}T12:00:00Z`,
            };
          },
        );
        return { data: remappings };
      },
    }),
  }),
});

export const {
  useListWorkspacesQuery,
  useGetWorkspaceQuery,
  useCreateWorkspaceMutation,
  useUpdateWorkspaceMutation,
  useDeleteWorkspaceMutation,
  useProvisionWorkspaceMutation,
  useUnprovisionWorkspaceMutation,
  useListTableRemappingsQuery,
} = workspaceApi;
