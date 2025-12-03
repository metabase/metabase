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
  canSetReplication: boolean;
  freeQuota: number;
  replicatedTables: TableInfo[];
  tablesWithoutPk: TableInfo[];
  tablesWithoutOwnerMatch: TableInfo[];
  totalEstimatedRowCount: number;
  errors?: {
    noTables?: boolean;
    noQuota?: boolean;
    invalidSchemaFiltersPattern?: boolean;
  };
}

export interface ReplicationSchemaFilters {
  "schema-filters-type": "inclusion" | "exclusion" | "all";
  "schema-filters-patterns": string;
}

export const DatabaseReplicationApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    previewDatabaseReplication: builder.mutation<
      PreviewDatabaseReplicationResponse,
      {
        databaseId: DatabaseId;
        replicationSchemaFilters: ReplicationSchemaFilters;
      }
    >({
      query: ({ databaseId, ...body }) => ({
        method: "POST",
        url: `/api/ee/database-replication/connection/${databaseId}/preview`,
        body,
      }),
    }),
    createDatabaseReplication: builder.mutation<
      void,
      {
        databaseId: DatabaseId;
        replicationSchemaFilters: ReplicationSchemaFilters;
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
