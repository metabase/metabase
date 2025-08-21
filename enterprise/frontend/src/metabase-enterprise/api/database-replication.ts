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

export interface TableInfo {
  tableName: string;
  tableSchema: string;
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
  replicatedTables: TableInfo[];
  tablesWithoutPk: TableInfo[];
  tablesWithoutOwnerMatch: TableInfo[];
  totalEstimatedRowCount: number;
}

export interface SchemaFilters {
  "schema-filters-type": "include" | "exclude" | "all";
  "schema-filters-patterns": string;
}

export const DatabaseReplicationApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    previewDatabaseReplication: builder.mutation<
      PreviewDatabaseReplicationResponse,
      {
        databaseId: DatabaseId;
        schemaFilters: SchemaFilters;
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
    createDatabaseReplication: builder.mutation<
      void,
      {
        databaseId: DatabaseId;
        schemaFilters: SchemaFilters;
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
  usePreviewDatabaseReplicationMutation,
  useCreateDatabaseReplicationMutation,
  useDeleteDatabaseReplicationMutation,
} = DatabaseReplicationApi;
