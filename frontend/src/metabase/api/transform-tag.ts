import type {
  CreateTransformTagRequest,
  TransformTag,
  TransformTagId,
  UpdateTransformTagRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideTransformTagListTags,
} from "./tags";

export const transformTagApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listTransformTags: builder.query<TransformTag[], void>({
      query: (params) => ({
        method: "GET",
        url: "/api/transform-tag",
        params,
      }),
      providesTags: (tags = []) => provideTransformTagListTags(tags),
    }),
    createTransformTag: builder.mutation<
      TransformTag,
      CreateTransformTagRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/transform-tag",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("transform-tag")]),
    }),
    updateTransformTag: builder.mutation<
      TransformTag,
      UpdateTransformTagRequest
    >({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/transform-tag/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("transform-tag"),
          idTag("transform-tag", id),
        ]),
    }),
    deleteTransformTag: builder.mutation<void, TransformTagId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/transform-tag/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("transform-tag"),
          // Invalidate transforms that are tagged with this tag, since
          // they are not tagged with listTag("transform-tag").
          idTag("transform-tag", id),
        ]),
    }),
  }),
});

export const {
  useListTransformTagsQuery,
  useCreateTransformTagMutation,
  useUpdateTransformTagMutation,
  useDeleteTransformTagMutation,
} = transformTagApi;
