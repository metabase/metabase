import type {
  CreateTransformRequest,
  ListTransformRunsRequest,
  ListTransformRunsResponse,
  Transform,
  TransformId,
  UpdateTransformRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideTransformListTags,
  provideTransformRunListTags,
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
    listTransformRuns: builder.query<
      ListTransformRunsResponse,
      ListTransformRunsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/transform/run",
        params,
      }),
      providesTags: (response) =>
        response ? provideTransformRunListTags(response.data) : [],
    }),
    getTransform: builder.query<Transform, TransformId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/transform/${id}`,
      }),
      providesTags: (transform) =>
        transform ? provideTransformTags(transform) : [],
    }),
    listTransformDependencies: builder.query<Transform[], TransformId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/transform/${id}/dependencies`,
      }),
      providesTags: (transforms, error, id) =>
        invalidateTags(error, [
          idTag("transform", id),
          ...(transforms?.flatMap(provideTransformTags) ?? []),
        ]),
    }),
    runTransform: builder.mutation<void, TransformId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/transform/${id}/run`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("transform", id), tag("table")]),
      onQueryStarted: async (id, { dispatch, queryFulfilled }) => {
        const patchResult = dispatch(
          transformApi.util.updateQueryData("getTransform", id, (draft) => {
            draft.last_run = {
              id: -1,
              status: "started",
              start_time: new Date().toISOString(),
              end_time: null,
              message: null,
              run_method: "manual",
            };
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
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
      onQueryStarted: async (
        { id, ...patch },
        { dispatch, queryFulfilled },
      ) => {
        const patchResult = dispatch(
          transformApi.util.updateQueryData("getTransform", id, (draft) => {
            Object.assign(draft, patch);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
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
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("transform"), listTag("table")]),
    }),
  }),
});

export const {
  useListTransformsQuery,
  useListTransformRunsQuery,
  useListTransformDependenciesQuery,
  useGetTransformQuery,
  useLazyGetTransformQuery,
  useRunTransformMutation,
  useCreateTransformMutation,
  useUpdateTransformMutation,
  useDeleteTransformMutation,
  useDeleteTransformTargetMutation,
} = transformApi;
