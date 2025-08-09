import { invalidateTags, tag } from "metabase/api/tags";
import type { DatabaseId } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export interface GetDatabaseReplicationResponse {
  connectionId: number;
  status: "initializing" | "active" | "error" | "paused";
  statusReason: string;
  error: "internal" | "not-found";
  errorDetail: string;
  type: string;
}

export interface PreviewDatabaseReplicationResponse {
  allQuotas: {
    hostingFeature: string;
    locked: boolean;
    quotaType: string;
    softLimit: number;
    updatedAt: string;
    usage: number;
  }[];
  canSetReplication: boolean;
  freeQuota: number;
  tablesWithoutPk: { name: string; schema: string }[];
  totalEstimatedRowCount: number;
}

export const DatabaseReplicationApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    previewDatabaseReplication: builder.mutation<
      PreviewDatabaseReplicationResponse,
      {
        databaseId: DatabaseId;
        schemaFilters?: { type: "include" | "exclude"; pattern: string }[];
      }
    >({
      query: ({ databaseId, ...body }) => ({
        method: "POST",
        url: `/api/ee/database-replication/connection/${databaseId}/preview`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
    getDatabaseReplication: builder.query<
      GetDatabaseReplicationResponse,
      {
        databaseId: DatabaseId;
      }
    >({
      query: ({ databaseId }) => ({
        method: "GET",
        url: `/api/ee/database-replication/connection/${databaseId}`,
      }),
    }),
    createDatabaseReplication: builder.mutation<
      void,
      {
        databaseId: DatabaseId;
        schemaFilters?: { type: "include" | "exclude"; pattern: string }[];
      }
    >({
      query: ({ databaseId, ...body }) => ({
        method: "POST",
        url: `/api/ee/database-replication/connection/${databaseId}`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
    deleteDatabaseReplication: builder.mutation<void, DatabaseId>({
      query: (databaseId) => ({
        method: "DELETE",
        url: `/api/ee/database-replication/connection/${databaseId}`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
  }),
});

export const {
  useGetDatabaseReplicationQuery,
  usePreviewDatabaseReplicationMutation,
  useCreateDatabaseReplicationMutation,
  useDeleteDatabaseReplicationMutation,
} = DatabaseReplicationApi;
