import _ from "underscore";

import type {
  ActionExecutionResult,
  CreateActionRequest,
  ExecuteActionRequest,
  ExecuteDashcardActionRequest,
  GetActionRequest,
  ListActionsRequest,
  ParametersForActionExecution,
  PrefetchActionValuesRequest,
  PrefetchDashcardValuesRequest,
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

export const actionApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listActions: builder.query<WritebackAction[], ListActionsRequest>({
      query: (params) => ({
        method: "GET",
        url: `/api/action`,
        params,
      }),
      providesTags: (collections = []) => provideActionListTags(collections),
    }),
    getAction: builder.query<WritebackAction, GetActionRequest>({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/action/${id}`,
      }),
      providesTags: (action) => (action ? provideActionTags(action) : []),
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
        // The action editor passes the full WritebackAction it fetched
        // (including server-managed fields like `creator`, `created_at`,
        // `database_enabled_actions`, ...). The backend routes anything
        // outside the Action columns to the type-specific update table
        // (query_action / implicit_action / http_action), where those
        // columns don't exist and the request 500s. Whitelist only the
        // fields that the API endpoint actually accepts.
        body: _.pick(body, [
          "id",
          "archived",
          "body",
          "database_id",
          "dataset_query",
          "description",
          "error_handle",
          "headers",
          "kind",
          "model_id",
          "name",
          "parameter_mappings",
          "parameters",
          "public_uuid",
          "response_handle",
          "template",
          "url",
          "visualization_settings",
        ]),
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
    executeAction: builder.mutation<
      ActionExecutionResult,
      ExecuteActionRequest
    >({
      query: ({ id, parameters }) => ({
        method: "POST",
        url: `/api/action/${id}/execute`,
        body: { parameters },
      }),
    }),
    prefetchActionValues: builder.query<
      ParametersForActionExecution,
      PrefetchActionValuesRequest
    >({
      query: ({ id, parameters }) => ({
        method: "GET",
        url: `/api/action/${id}/execute`,
        params: { parameters: JSON.stringify(parameters) },
      }),
      // Prefetch is an imperative fetch-and-discard with row-specific params
      // that rarely repeat, so there's nothing to gain from caching entries.
      keepUnusedDataFor: 0,
    }),
    executeDashcardAction: builder.mutation<
      ActionExecutionResult,
      ExecuteDashcardActionRequest
    >({
      query: ({ dashboardId, dashcardId, modelId, parameters }) => ({
        method: "POST",
        url: `/api/dashboard/${dashboardId}/dashcard/${dashcardId}/execute`,
        body: { modelId, parameters },
      }),
    }),
    prefetchDashcardValues: builder.query<
      ParametersForActionExecution,
      PrefetchDashcardValuesRequest
    >({
      query: ({ dashboardId, dashcardId, parameters }) => ({
        method: "GET",
        url: `/api/dashboard/${dashboardId}/dashcard/${dashcardId}/execute`,
        params: { parameters: JSON.stringify(parameters) },
      }),
      // Prefetch is an imperative fetch-and-discard with per-dashcard params
      // that rarely repeat, so there's nothing to gain from caching entries.
      keepUnusedDataFor: 0,
    }),
  }),
});

export const {
  useGetActionQuery,
  useListActionsQuery,
  useListPublicActionsQuery,
  useCreateActionMutation,
  useUpdateActionMutation,
  useDeleteActionMutation,
  useCreateActionPublicLinkMutation,
  useDeleteActionPublicLinkMutation,
  useExecuteActionMutation,
  endpoints: {
    listPublicActions,
    deleteActionPublicLink,
    createActionPublicLink,
    executeAction,
    prefetchActionValues,
    executeDashcardAction,
    prefetchDashcardValues,
  },
} = actionApi;
