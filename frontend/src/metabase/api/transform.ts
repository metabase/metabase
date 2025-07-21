import type {
  CreateTransformRequest,
  Transform,
  TransformId,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideTransformListTags,
  provideTransformTags,
  tag,
} from "./tags";

export const transformApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listTransforms: builder.query<Transform[], void>({
      query: (params) => ({
        method: "GET",
        url: "/api/transform",
        params,
      }),
      providesTags: (transforms = []) => provideTransformListTags(transforms),
    }),
    getTransform: builder.query<Transform, TransformId>({
      query: (id) => ({
        method: "GET",
        url: `/api/transform/${id}`,
      }),
      providesTags: (transform) =>
        transform ? provideTransformTags(transform) : [],
    }),
    createTransform: builder.mutation<Transform, CreateTransformRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/transform",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("transform"), tag("transform")]),
    }),
    executeTransform: builder.mutation<Transform, TransformId>({
      query: (id) => ({
        method: "POST",
        url: `/api/transform/${id}/execute`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          tag("table"),
          tag("field"),
          tag("field-values"),
        ]),
    }),
    deleteTransform: builder.mutation<Transform, TransformId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/transform/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("transform"), idTag("transform", id)]),
    }),
  }),
});

export const {
  useListTransformsQuery,
  useGetTransformQuery,
  useCreateTransformMutation,
  useExecuteTransformMutation,
  useDeleteTransformMutation,
} = transformApi;
