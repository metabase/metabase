import type {
  CreateTransformRequest,
  ListTransformExecutionsRequest,
  ListTransformExecutionsResponse,
  Transform,
  TransformId,
  UpdateTransformRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideTransformExecutionListTags,
  provideTransformListTags,
  provideTransformTags,
  tag,
} from "./tags";

export const transformApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listTransforms: builder.query<Transform[], void>({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/transform",
        params,
      }),
      providesTags: (transforms = []) => provideTransformListTags(transforms),
    }),
    listTransformExecutions: builder.query<
      ListTransformExecutionsResponse,
      ListTransformExecutionsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/transform/execution",
        params,
      }),
      providesTags: (response) =>
        response ? provideTransformExecutionListTags(response.data) : [],
    }),
    getTransform: builder.query<Transform, TransformId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/transform/${id}`,
      }),
      providesTags: (transform) =>
        transform ? provideTransformTags(transform) : [],
    }),
    executeTransform: builder.mutation<void, TransformId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/transform/${id}/execute`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("transform", id), tag("table")]),
    }),
    createTransform: builder.mutation<Transform, CreateTransformRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/transform",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("transform")]),
    }),
    updateTransform: builder.mutation<Transform, UpdateTransformRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/transform/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("transform", id)]),
    }),
    deleteTransform: builder.mutation<void, TransformId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/transform/${id}`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("transform")]),
    }),
    deleteTransformTarget: builder.mutation<void, TransformId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/transform/${id}/table`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("transform", id), listTag("table")]),
    }),
  }),
});

export const {
  useListTransformsQuery,
  useListTransformExecutionsQuery,
  useGetTransformQuery,
  useExecuteTransformMutation,
  useCreateTransformMutation,
  useUpdateTransformMutation,
  useDeleteTransformMutation,
  useDeleteTransformTargetMutation,
} = transformApi;
