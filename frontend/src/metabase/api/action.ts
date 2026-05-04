import _ from "underscore";

import { ActionSchema } from "metabase/schema";
import type {
  CreateActionRequest,
  GetActionRequest,
  ListActionsRequest,
  UpdateActionRequest,
  WritebackAction,
  WritebackActionId,
} from "metabase-types/api";
import type { GetPublicAction } from "metabase-types/api/actions";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideActionListTags,
  provideActionTags,
} from "./tags";
import { hydrateLegacyEntities } from "./utils/hydrate-legacy-entities";

export const actionApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listActions: builder.query<WritebackAction[], ListActionsRequest>({
      query: (params) => ({
        method: "GET",
        url: `/api/action`,
        params,
      }),
      providesTags: (collections = []) => provideActionListTags(collections),
      onQueryStarted: hydrateLegacyEntities([ActionSchema]),
    }),
    getAction: builder.query<WritebackAction, GetActionRequest>({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/action/${id}`,
      }),
      providesTags: (action) => (action ? provideActionTags(action) : []),
      onQueryStarted: hydrateLegacyEntities(ActionSchema),
    }),
    createAction: builder.mutation<WritebackAction, CreateActionRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/action",
        body,
      }),
      invalidatesTags: (action, error) =>
        action ? invalidateTags(error, [listTag("action")]) : [],
    }),
    updateAction: builder.mutation<WritebackAction, UpdateActionRequest>({
      query: (body) => ({
        method: "PUT",
        url: `/api/action/${body.id}`,
        body: _.omit(body, "type"), // Changing action type is not supported
      }),
      invalidatesTags: (action, error) =>
        action
          ? invalidateTags(error, [
              listTag("action"),
              idTag("action", action.id),
            ])
          : [],
    }),
    deleteAction: builder.mutation<WritebackAction, WritebackActionId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/action/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("action"), idTag("action", id)]),
    }),
    listPublicActions: builder.query<GetPublicAction[], void>({
      query: () => ({
        method: "GET",
        url: "/api/action/public",
      }),
      providesTags: (actions = []) => [
        ...actions.map((action) => idTag("public-action", action.id)),
        listTag("public-action"),
      ],
    }),
    deleteActionPublicLink: builder.mutation<void, { id: WritebackActionId }>({
      query: ({ id }) => ({
        method: "DELETE",
        url: `/api/action/${id}/public_link`,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("public-action"),
          idTag("public-action", id),
          listTag("action"),
          idTag("action", id),
        ]),
    }),
    createActionPublicLink: builder.mutation<
      { uuid: string },
      { id: WritebackActionId }
    >({
      query: ({ id }) => ({
        method: "POST",
        url: `/api/action/${id}/public_link`,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("public-card"),
          listTag("action"),
          idTag("action", id),
        ]),
    }),
  }),
});

export const {
  useGetActionQuery,
  useListActionsQuery,
  useListPublicActionsQuery,
  useUpdateActionMutation,
  useCreateActionPublicLinkMutation,
  useDeleteActionPublicLinkMutation,
  endpoints: {
    listPublicActions,
    deleteActionPublicLink,
    createActionPublicLink,
  },
} = actionApi;
