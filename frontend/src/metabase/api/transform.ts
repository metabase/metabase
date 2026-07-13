import { isResourceNotFoundError } from "metabase/utils/errors";
import type {
  CancelJobRunRequest,
  CreateTransformRequest,
  DagTransform,
  Dataset,
  GetInspectorLensRequest,
  InspectorDiscoveryResponse,
  InspectorLens,
  ListDagRunTransformRunsRequest,
  ListDagTransformsRequest,
  ListTransformGraphRunsRequest,
  ListTransformGraphRunsResponse,
  ListTransformRunsRequest,
  ListTransformRunsResponse,
  ListTransformsRequest,
  RunInspectorQueryRequest,
  RunTransformDagRequest,
  RunTransformDagResponse,
  RunTransformResponse,
  Transform,
  TransformDagRunId,
  TransformId,
  TransformRunForJobRun,
  UpdateTransformRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideInspectorLensTags,
  provideTransformListTags,
  provideTransformRunListTags,
  provideTransformTags,
  tag,
} from "./tags";

export const transformApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listTransforms: builder.query<Transform[], ListTransformsRequest>({
      query: (params) => ({
        method: "GET",
        url: "/api/transform",
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
        url: "/api/transform/run",
        params,
      }),
      providesTags: (response) =>
        response ? provideTransformRunListTags(response.data) : [],
    }),
    getTransform: builder.query<Transform, TransformId>({
      query: (id) => ({
        method: "GET",
        url: `/api/transform/${id}`,
      }),
      providesTags: (transform) =>
        transform ? provideTransformTags(transform) : [],
    }),
    runTransform: builder.mutation<RunTransformResponse, TransformId>({
      query: (id) => ({
        method: "POST",
        url: `/api/transform/${id}/run`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          idTag("transform", id),
          tag("table"),
          listTag("table-remapping"),
          listTag("transform-run"),
          listTag("table-index"),
        ]),
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
        url: `/api/transform/${id}/cancel`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          idTag("transform", id),
          tag("table"),
          listTag("transform-run"),
        ]),
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
            // When the error is not a 404, undo the patch as something is wrong
            patchResult.undo();
          } else {
            // Avoid undoing the patch when the error is 404
            // as this will confuse the transform pages by setting the
            // status back to started even though we know the run must've
            // completed (in either succeeded, failed, timeout or canceled state).
            // We just don't know which state it is, so we leave it in canceling
            // state and trigger a re-fetch of the transform to get the latest state.
            dispatch(Api.util.invalidateTags([idTag("transform", id)]));
          }
        }
      },
    }),
    runTransformDag: builder.mutation<
      RunTransformDagResponse,
      RunTransformDagRequest
    >({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/transform/${id}/run-dag`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          idTag("transform", id),
          tag("transform"),
          tag("table"),
          listTag("table-remapping"),
          listTag("transform-run"),
          listTag("transform-dag-run"),
        ]),
    }),
    listDagTransforms: builder.query<DagTransform[], ListDagTransformsRequest>({
      query: ({ transformId, direction }) => ({
        method: "GET",
        url: `/api/transform/${transformId}/dag-transforms`,
        params: { direction },
      }),
      providesTags: (_response, _error, { transformId }) => [
        idTag("transform", transformId),
      ],
    }),
    listDagRunTransformRuns: builder.query<
      TransformRunForJobRun[],
      ListDagRunTransformRunsRequest
    >({
      query: ({ dagRunId }) => ({
        method: "GET",
        url: `/api/transform-dag-run/${dagRunId}/transform-runs`,
      }),
      providesTags: (_response, _error, { dagRunId }) => [
        idTag("transform-dag-run", dagRunId),
      ],
    }),
    cancelDagRun: builder.mutation<void, TransformDagRunId>({
      query: (runId) => ({
        method: "POST",
        url: `/api/transform-dag-run/${runId}/cancel`,
      }),
      invalidatesTags: (_, error, runId) =>
        invalidateTags(error, [
          idTag("transform-dag-run", runId),
          listTag("transform-dag-run"),
          listTag("transform-run"),
          tag("transform"),
        ]),
    }),
    cancelJobRun: builder.mutation<void, CancelJobRunRequest>({
      query: ({ jobId, runId }) => ({
        method: "POST",
        url: `/api/transform-job/${jobId}/runs/${runId}/cancel`,
      }),
      invalidatesTags: (_, error, { jobId }) =>
        invalidateTags(error, [
          idTag("transform-job", jobId),
          listTag("transform-job"),
          listTag("transform-run"),
          tag("transform"),
        ]),
    }),
    listTransformGraphRuns: builder.query<
      ListTransformGraphRunsResponse,
      ListTransformGraphRunsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/transform/runs",
        params,
      }),
      providesTags: [
        listTag("transform-run"),
        listTag("transform-dag-run"),
        listTag("transform-job"),
      ],
    }),
    createTransform: builder.mutation<Transform, CreateTransformRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/transform",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          listTag("transform"),
          listTag("external-transform"),
        ]),
    }),
    updateTransform: builder.mutation<Transform, UpdateTransformRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/transform/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id, collection_id }) => {
        const tags = [
          listTag("transform"),
          idTag("transform", id),
          listTag("revision"),
        ];
        if (collection_id != null) {
          tags.push(idTag("collection", collection_id));
        }
        return invalidateTags(error, tags);
      },
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
        url: `/api/transform/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("transform"),
          idTag("transform", id),
          listTag("transform-run"),
          listTag("transform-dag-run"),
        ]),
    }),
    deleteTransformTarget: builder.mutation<void, TransformId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/transform/${id}/table`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("transform"), listTag("table")]),
    }),
    resetCheckpoint: builder.mutation<void, TransformId>({
      query: (id) => ({
        method: "POST",
        url: `/api/transform/${id}/reset-checkpoint`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("transform", id)]),
    }),
    getInspectorDiscovery: builder.query<
      InspectorDiscoveryResponse,
      TransformId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/transforms/${id}/inspect`,
      }),
      providesTags: (_, _error, id) => [idTag("transform", id)],
    }),
    getInspectorLens: builder.query<InspectorLens, GetInspectorLensRequest>({
      query: ({ transformId, lensId, lensParams }) => ({
        method: "GET",
        url: `/api/ee/transforms/${transformId}/inspect/${lensId}`,
        params: lensParams,
      }),
      providesTags: provideInspectorLensTags,
    }),
    runInspectorQuery: builder.query<Dataset, RunInspectorQueryRequest>({
      query: ({ transformId, lensId, query, lensParams }) => ({
        method: "POST",
        url: `/api/ee/transforms/${transformId}/inspect/${lensId}/query`,
        body: { query, lens_params: lensParams },
      }),
    }),
  }),
});

export const {
  useListTransformsQuery,
  useListTransformRunsQuery,
  useGetTransformQuery,
  useLazyGetTransformQuery,
  useGetInspectorDiscoveryQuery,
  useGetInspectorLensQuery,
  useLazyGetInspectorLensQuery,
  useRunTransformMutation,
  useRunTransformDagMutation,
  useListDagTransformsQuery,
  useListDagRunTransformRunsQuery,
  useCancelDagRunMutation,
  useCancelJobRunMutation,
  useListTransformGraphRunsQuery,
  useCancelCurrentTransformRunMutation,
  useCreateTransformMutation,
  useUpdateTransformMutation,
  useDeleteTransformMutation,
  useDeleteTransformTargetMutation,
  useResetCheckpointMutation,
  useRunInspectorQueryQuery,
} = transformApi;
