import type {
  ActionSecret,
  ActionSecretId,
  CreateActionSecretRequest,
  UpdateActionSecretRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

export const actionSecretApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listActionSecrets: builder.query<ActionSecret[], void>({
      query: () => ({
        method: "GET",
        url: "/api/action-secret",
      }),
      providesTags: (secrets = []) => [
        listTag("action-secret"),
        ...secrets.map((secret) => idTag("action-secret", secret.id)),
      ],
    }),
    createActionSecret: builder.mutation<
      ActionSecret,
      CreateActionSecretRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/action-secret",
        body,
      }),
      invalidatesTags: (_secret, error) =>
        invalidateTags(error, [listTag("action-secret")]),
    }),
    updateActionSecret: builder.mutation<
      ActionSecret,
      UpdateActionSecretRequest
    >({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/action-secret/${id}`,
        body,
      }),
      invalidatesTags: (_secret, error, { id }) =>
        invalidateTags(error, [
          listTag("action-secret"),
          idTag("action-secret", id),
        ]),
    }),
    deleteActionSecret: builder.mutation<void, ActionSecretId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/action-secret/${id}`,
      }),
      invalidatesTags: (_result, error, id) =>
        invalidateTags(error, [
          listTag("action-secret"),
          idTag("action-secret", id),
        ]),
    }),
  }),
});

export const {
  useListActionSecretsQuery,
  useCreateActionSecretMutation,
  useUpdateActionSecretMutation,
  useDeleteActionSecretMutation,
} = actionSecretApi;
