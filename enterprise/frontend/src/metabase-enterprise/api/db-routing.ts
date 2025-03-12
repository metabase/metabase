import type {
  CreateMirrorDatabaseRequest,
  Database,
  UpdateDatabaseRouterRequest,
} from "metabase-types/api";
import { idTag, listTag, invalidateTags } from "metabase/api/tags";

import { EnterpriseApi } from "./api";

export const dbRoutingApi = EnterpriseApi.injectEndpoints({
  endpoints: builder => ({
    // TODO: find response type
    updateRouterDatabase: builder.mutation<void, UpdateDatabaseRouterRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/database-routing/router-database/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("database"), idTag("database", id)]),
    }),
    createMirrorDatabase: builder.mutation<
      Database[],
      CreateMirrorDatabaseRequest
    >({
      query: body => ({
        method: "POST",
        url: "/api/ee/database-routing/mirror-database",
        body,
      }),
      invalidatesTags: (_, error, { router_database_id }) =>
        invalidateTags(error, [
          listTag("database"),
          idTag("database", router_database_id),
        ]),
    }),
  }),
});

export const {
  useCreateMirrorDatabaseMutation,
  useUpdateRouterDatabaseMutation,
} = dbRoutingApi;
