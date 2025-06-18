import { invalidateTags, tag } from "metabase/api/tags";
import type { DatabaseId } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const pgReplicationApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    createPgReplication: builder.mutation<void, DatabaseId>({
      query: (databaseId) => ({
        method: "POST",
        url: `/api/ee/pg-replication/connection/${databaseId}`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
    deletePgReplication: builder.mutation<void, DatabaseId>({
      query: (databaseId) => ({
        method: "DELETE",
        url: `/api/ee/pg-replication/connection/${databaseId}`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
  }),
});

export const {
  useCreatePgReplicationMutation,
  useDeletePgReplicationMutation,
} = pgReplicationApi;
