import { idTag, invalidateTags, listTag } from "metabase/api/tags";
import type {
  CreateMirrorDatabaseRequest,
  Database,
  UpdateDatabaseRouterRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const dbRoutingApi = EnterpriseApi.injectEndpoints({
  endpoints: builder => ({
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
      invalidatesTags: (response, error, { router_database_id }) =>
        invalidateTags(error, [
          listTag("database"),
          idTag("database", router_database_id),
          ...(response?.map(({ id }) => idTag("database", id)) ?? []),
        ]),
    }),
  }),
});

export const {
  useCreateMirrorDatabaseMutation,
  useUpdateRouterDatabaseMutation,
} = dbRoutingApi;
