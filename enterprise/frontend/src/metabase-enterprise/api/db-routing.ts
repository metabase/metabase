import _ from "underscore";

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
    // this API endpoint is a bulk endpoint but the FE never needs this capability
    // for ease of use and consistency with other DB creation endpoints the request
    // and responses types are mapped over to act as if it only can create a single db
    createDestinationDatabase: builder.mutation<
      Database,
      CreateDestinationDatabaseRequest
    >({
      query: ({ router_database_id, destination_database }) => ({
        method: "POST",
        url: "/api/ee/database-routing/mirror-database?check_connection_details=true",
        body: {
          router_database_id,
          mirrors: [destination_database],
        },
      }),
      transformResponse: (response: [Database]): Database => response[0],
      transformErrorResponse: (response) => {
        // response shape from api should be:
        // Record<db_name, { message: string; errors: Record<string, string>; }>;
        if (_.isObject(response) && _.isObject(response.data)) {
          const maybeDbEditErrorType = Object.values(response.data)?.[0];
          if (_.isObject(maybeDbEditErrorType)) {
            return maybeDbEditErrorType;
          }
        }

        return response;
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
