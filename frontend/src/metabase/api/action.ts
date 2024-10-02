import type {
  GetActionRequest,
  WritebackAction,
  WritebackActionId,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

export const actionApi = Api.injectEndpoints({
  endpoints: builder => ({
    getAction: builder.query<WritebackAction, GetActionRequest>({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/action/${id}`,
      }),
      providesTags: action => (action ? [idTag("action", action.id)] : []),
    }),
    listPublicActions: builder.query<PublicAction[], void>({
      query: () => ({
        method: "GET",
        url: "/api/action/public",
      }),
      providesTags: (actions = []) => [
        ...actions.map(action => idTag("public-action", action.id)),
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
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("public-card")]),
    }),
  }),
});

type PublicAction = {
  id: WritebackActionId;
  name: string;
  public_uuid: string | null;
  model_id: number;
};

export const {
  useGetActionQuery,
  useListPublicActionsQuery,
  useDeleteActionPublicLinkMutation,
  endpoints: {
    listPublicActions,
    deleteActionPublicLink,
    createActionPublicLink,
  },
} = actionApi;
