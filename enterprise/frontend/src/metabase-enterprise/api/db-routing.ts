import type {
  CreateDatabaseRouterRequest,
  CreateMirrorDatabaseRequest,
  DeleteDatabaseRouterRequest,
  UpdateDatabaseRouterRequest,
} from "metabase-types/api";
// import { idTag, invalidateTags, listTag } from "metabase/api/tags";

import { EnterpriseApi } from "./api";

// TODO: add include_mirror_databases param to getting a database
// TODO: think through cache invalidation

export const dbRoutingApi = EnterpriseApi.injectEndpoints({
  endpoints: builder => ({
    // TODO: find response type
    createMirrorDatabase: builder.mutation<void, CreateMirrorDatabaseRequest>({
      query: body => ({
        method: "POST",
        url: "/api/ee/database-routing/mirror-database",
        body,
      }),
      // invalidatesTags: (_, error) =>
      //   invalidateTags(error, [listTag("database")]),
    }),
    // TODO: find response type
    createRouter: builder.mutation<void, CreateDatabaseRouterRequest>({
      query: body => ({
        method: "POST",
        url: "/api/ee/database-routing/router",
        body,
      }),
      // invalidatesTags: (_, error) =>
      //   invalidateTags(error, [listTag("database")]),
    }),
    // TODO: find response type
    updateRouter: builder.mutation<void, UpdateDatabaseRouterRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/database-routing/router/${id}`,
        body,
      }),
      // TODO
      // invalidatesTags: (_, error, { id }) =>
      //   invalidateTags(error, [idTag("database-router", id)]),
    }),
    // TODO: find response type
    deleteRouter: builder.mutation<void, DeleteDatabaseRouterRequest>({
      query: ({ id }) => ({
        method: "DELETE",
        url: `/api/ee/database-routing/router/${id}`,
      }),
      // invalidatesTags: (_, error, { id }) =>
      //   invalidateTags(error, [
      //     idTag("database-router", id),
      //     listTag("database"),
      //   ]),
    }),
  }),
});

export const {
  useCreateMirrorDatabaseMutation,
  useCreateRouterMutation,
  useUpdateRouterMutation,
  useDeleteRouterMutation,
} = dbRoutingApi;
