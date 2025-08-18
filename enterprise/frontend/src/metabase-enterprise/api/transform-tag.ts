import type {
  CreateTransformTagRequest,
  TransformTag,
  TransformTagId,
  UpdateTransformTagRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideTransformTagListTags,
} from "./tags";

export const transformTagApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listTransformTags: builder.query<TransformTag[], void>({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/transform-tag",
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
        url: "/api/ee/transform-tag",
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
        url: `/api/ee/transform-tag/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("transform-tag", id)]),
    }),
    deleteTransformTag: builder.mutation<void, TransformTagId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/transform-tag/${id}`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("transform-tag")]),
    }),
  }),
});

export const {
  useListTransformTagsQuery,
  useCreateTransformTagMutation,
  useUpdateTransformTagMutation,
  useDeleteTransformTagMutation,
} = transformTagApi;
