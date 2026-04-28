import type {
  CreateWorkspaceDatabaseRequest,
  CreateWorkspaceRequest,
  DeleteWorkspaceDatabaseRequest,
  TableRemapping,
  UpdateWorkspaceDatabaseRequest,
  UpdateWorkspaceRequest,
  Workspace,
  WorkspaceId,
  WorkspaceInstance,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideWorkspaceListTags,
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
    }),
    deleteWorkspace: builder.mutation<void, WorkspaceId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/workspace/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
    }),
    createWorkspaceDatabase: builder.mutation<
      Workspace,
      CreateWorkspaceDatabaseRequest
    >({
      query: ({ workspace_id, database_id, input_schemas }) => ({
        method: "POST",
        url: `/api/ee/workspace/${workspace_id}/database`,
        body: { database_id, input_schemas },
      }),
      invalidatesTags: (_, error, { workspace_id }) =>
        invalidateTags(error, [
          listTag("workspace"),
          idTag("workspace", workspace_id),
        ]),
    }),
    updateWorkspaceDatabase: builder.mutation<
      Workspace,
      UpdateWorkspaceDatabaseRequest
    >({
      query: ({ workspace_id, database_id, input_schemas }) => ({
        method: "PUT",
        url: `/api/ee/workspace/${workspace_id}/database/${database_id}`,
        body: { input_schemas },
      }),
      invalidatesTags: (_, error, { workspace_id }) =>
        invalidateTags(error, [
          listTag("workspace"),
          idTag("workspace", workspace_id),
        ]),
    }),
    deleteWorkspaceDatabase: builder.mutation<
      Workspace,
      DeleteWorkspaceDatabaseRequest
    >({
      query: ({ workspace_id, database_id }) => ({
        method: "DELETE",
        url: `/api/ee/workspace/${workspace_id}/database/${database_id}`,
      }),
      invalidatesTags: (_, error, { workspace_id }) =>
        invalidateTags(error, [
          listTag("workspace"),
          idTag("workspace", workspace_id),
        ]),
    }),
    getCurrentWorkspace: builder.query<WorkspaceInstance, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/workspace/current",
      }),
      // STUB: uncomment to return mock workspace data without hitting the backend
      // queryFn: async () => {
      //   const workspace: WorkspaceInstance = {
      //     name: "Acme Analytics",
      //     remappings_count: 5,
      //     databases: {
      //       1: {
      //         name: "Sample Postgres",
      //         input_schemas: ["public", "marketing"],
      //         output_schema: "analytics",
      //       },
      //       2: {
      //         name: "Warehouse",
      //         input_schemas: ["raw", "staging"],
      //         output_schema: "warehouse",
      //       },
      //       3: {
      //         name: "Events DB",
      //         input_schemas: ["ingest"],
      //         output_schema: "sandbox",
      //       },
      //     },
      //   };
      //   return { data: workspace };
      // },
    }),
    listTableRemappings: builder.query<TableRemapping[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/workspace/remappings",
      }),
      // STUB: uncomment to return mock remappings without hitting the backend
      // queryFn: async () => {
      //   const remappings: TableRemapping[] = [
      //     {
      //       id: 1,
      //       database_id: 1,
      //       from_schema: "public",
      //       from_table_name: "orders",
      //       from_table_id: null,
      //       to_schema: "analytics",
      //       to_table_name: "orders_v1",
      //       to_table_id: null,
      //       created_at: "2026-04-01T12:00:00Z",
      //     },
      //     {
      //       id: 2,
      //       database_id: 1,
      //       from_schema: "public",
      //       from_table_name: "people",
      //       from_table_id: null,
      //       to_schema: "analytics",
      //       to_table_name: "people_v1",
      //       to_table_id: null,
      //       created_at: "2026-04-02T12:00:00Z",
      //     },
      //     {
      //       id: 3,
      //       database_id: 2,
      //       from_schema: "raw",
      //       from_table_name: "products",
      //       from_table_id: null,
      //       to_schema: "marts",
      //       to_table_name: "products_v1",
      //       to_table_id: null,
      //       created_at: "2026-04-03T12:00:00Z",
      //     },
      //     {
      //       id: 4,
      //       database_id: 2,
      //       from_schema: "staging",
      //       from_table_name: "events",
      //       from_table_id: null,
      //       to_schema: "warehouse",
      //       to_table_name: "events_v1",
      //       to_table_id: null,
      //       created_at: "2026-04-04T12:00:00Z",
      //     },
      //     {
      //       id: 5,
      //       database_id: 3,
      //       from_schema: "ingest",
      //       from_table_name: "sessions",
      //       from_table_id: null,
      //       to_schema: "sandbox",
      //       to_table_name: "sessions_v1",
      //       to_table_id: null,
      //       created_at: "2026-04-05T12:00:00Z",
      //     },
      //   ];
      //   return { data: remappings };
      // },
    }),
  }),
});

export const {
  useListWorkspacesQuery,
  useCreateWorkspaceMutation,
  useUpdateWorkspaceMutation,
  useDeleteWorkspaceMutation,
  useCreateWorkspaceDatabaseMutation,
  useUpdateWorkspaceDatabaseMutation,
  useDeleteWorkspaceDatabaseMutation,
  useGetCurrentWorkspaceQuery,
  useListTableRemappingsQuery,
} = workspaceApi;
