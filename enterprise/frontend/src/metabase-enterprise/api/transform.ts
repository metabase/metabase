import type {
  CreateTransformRequest,
  Transform,
  TransformId,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
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
    getTransform: builder.query<Transform, TransformId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/transform/${id}`,
      }),
      providesTags: (transform) =>
        transform ? provideTransformTags(transform) : [],
    }),
    createTransform: builder.mutation<Transform, CreateTransformRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/transform",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("transform"), tag("transform")]),
    }),
    executeTransform: builder.mutation<Transform, TransformId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/transform/${id}/execute`,
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
        url: `/api/ee/transform/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("transform"), idTag("transform", id)]),
    }),
  }),
});

export const {
  useListTransformsQuery,
  useLazyListTransformsQuery,
  useGetTransformQuery,
  useCreateTransformMutation,
  useExecuteTransformMutation,
  useDeleteTransformMutation,
} = transformApi;
