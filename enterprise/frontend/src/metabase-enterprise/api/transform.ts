import { isResourceNotFoundError } from "metabase/lib/errors";
import type {
  CreateTransformRequest,
  ListTransformRunsRequest,
  ListTransformRunsResponse,
  RunTransformResponse,
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
    runTransform: builder.mutation<RunTransformResponse, TransformId>({
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
          const { data } = await queryFulfilled;

          dispatch(
            transformApi.util.updateQueryData("getTransform", id, (draft) => {
              if (draft.last_run == null) {
                return;
              }
              draft.last_run.id = data.run_id;
            }),
          );
        } catch {
          patchResult.undo();
        }
      },
    }),
    cancelCurrentTransformRun: builder.mutation<void, TransformId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/transform/${id}/cancel`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("transform", id), tag("table")]),
      onQueryStarted: async (id, { dispatch, queryFulfilled }) => {
        const patchResult = dispatch(
          transformApi.util.updateQueryData("getTransform", id, (draft) => {
            if (draft.last_run) {
              draft.last_run.status = "canceling";
            }
          }),
        );

        try {
          await queryFulfilled;
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "error" in error &&
            !isResourceNotFoundError(error.error)
          ) {
            // Avoid undoing the patch when the error is 404
            // as this will confuse the transform pages by setting the
            // status back to started even though we know the run must've
            // completed (in either succeeded, failed, timeout or canceled state).
            // We just don't know which state it is, so we leave it in canceling
            // state until the FE requests the state again.t
            patchResult.undo();
          }
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
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("transform", id), listTag("table")]),
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
  useCancelCurrentTransformRunMutation,
  useCreateTransformMutation,
  useUpdateTransformMutation,
  useDeleteTransformMutation,
  useDeleteTransformTargetMutation,
} = transformApi;
