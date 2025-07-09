import { invalidateTags, tag } from "metabase/api/tags";
import type { DatabaseId } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const DatabaseReplicationApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    createDatabaseReplication: builder.mutation<void, DatabaseId>({
      query: (databaseId) => ({
        method: "POST",
        url: `/api/ee/database-replication/connection/${databaseId}`,
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
  useCreateDatabaseReplicationMutation,
  useDeleteDatabaseReplicationMutation,
} = DatabaseReplicationApi;
