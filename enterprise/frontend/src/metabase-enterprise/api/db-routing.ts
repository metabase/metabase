import { idTag, invalidateTags, listTag } from "metabase/api/tags";
import type {
  CreateDestinationDatabaseRequest,
  Database,
  UpdateDatabaseRouterRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const dbRoutingApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    updateRouterDatabase: builder.mutation<void, UpdateDatabaseRouterRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/database-routing/router-database/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("database"), idTag("database", id)]),
    }),
    createDestinationDatabase: builder.mutation<
      Database,
      CreateDestinationDatabaseRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/database-routing/mirror-database",
        body,
      }),
      transformResponse: (response: [Database]): Database => {
        return response[0];
      },
      invalidatesTags: (db, error) =>
        invalidateTags(error, [
          listTag("database"),
          ...(db ? [idTag("database", db.id)] : []),
        ]),
    }),
  }),
});

export const {
  useCreateDestinationDatabaseMutation,
  useUpdateRouterDatabaseMutation,
} = dbRoutingApi;
