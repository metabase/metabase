import type {
  CreateTransformJobRequest,
  ListAllDagRunsRequest,
  ListAllDagRunsResponse,
  ListJobRunTransformRunsRequest,
  ListTransformJobRunsRequest,
  ListTransformJobRunsResponse,
  ListTransformJobsRequest,
  Transform,
  TransformJob,
  TransformJobId,
  TransformJobRunId,
  TransformRunForJobRun,
  UpdateTransformJobRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideTransformJobListTags,
  provideTransformJobTags,
  provideTransformListTags,
  tag,
} from "./tags";

export const transformJobApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listTransformJobs: builder.query<TransformJob[], ListTransformJobsRequest>({
      query: (params) => ({
        method: "GET",
        url: "/api/transform-job",
        params,
      }),
      providesTags: (jobs = []) => provideTransformJobListTags(jobs),
    }),
    getTransformJob: builder.query<TransformJob, TransformJobId>({
      query: (id) => ({
        method: "GET",
        url: `/api/transform-job/${id}`,
      }),
      providesTags: (job) => (job ? provideTransformJobTags(job) : []),
    }),
    listTransformJobTransforms: builder.query<Transform[], TransformJobId>({
      query: (id) => ({
        method: "GET",
        url: `/api/transform-job/${id}/transforms`,
      }),
      providesTags: (transforms = [], _error, id) => [
        idTag("transform-job", id),
        ...provideTransformListTags(transforms),
      ],
    }),
    listAllDagRuns: builder.query<
      ListAllDagRunsResponse,
      ListAllDagRunsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/transform-job/dag-runs",
        params,
      }),
      // DAG runs live in the same store as job runs and are seeded from transforms,
      // so invalidate this list whenever any transform or transform-run changes.
      providesTags: () => [listTag("transform"), listTag("transform-run")],
    }),
    cancelDagRun: builder.mutation<void, TransformJobRunId>({
      query: (runId) => ({
        method: "POST",
        url: `/api/transform-job/dag-runs/${runId}/cancel`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("transform"), listTag("transform-run")]),
    }),
    listTransformJobRuns: builder.query<
      ListTransformJobRunsResponse,
      ListTransformJobRunsRequest
    >({
      query: ({ jobId, ...params }) => ({
        method: "GET",
        url: `/api/transform-job/${jobId}/runs`,
        params,
      }),
      providesTags: (_response, _error, { jobId }) => [
        idTag("transform-job", jobId),
      ],
    }),
    listJobRunTransformRuns: builder.query<
      TransformRunForJobRun[],
      ListJobRunTransformRunsRequest
    >({
      query: ({ jobId, runId }) => ({
        method: "GET",
        url: `/api/transform-job/${jobId}/runs/${runId}/transform-runs`,
      }),
      providesTags: (_response, _error, { jobId }) => [
        idTag("transform-job", jobId),
      ],
    }),
    runTransformJob: builder.mutation<void, TransformJobId>({
      query: (id) => ({
        method: "POST",
        url: `/api/transform-job/${id}/run`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          idTag("transform-job", id),
          tag("transform"),
          tag("table"),
          listTag("table-remapping"),
        ]),
      onQueryStarted: async (id, { dispatch, queryFulfilled }) => {
        const patchResult = dispatch(
          transformJobApi.util.updateQueryData(
            "getTransformJob",
            id,
            (draft) => {
              draft.last_run = {
                id: -1,
                status: "started",
                start_time: new Date().toISOString(),
                end_time: null,
                message: null,
                run_method: "manual",
              };
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
    }),
    createTransformJob: builder.mutation<
      TransformJob,
      CreateTransformJobRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/transform-job",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("transform-job")]),
    }),
    updateTransformJob: builder.mutation<
      TransformJob,
      UpdateTransformJobRequest
    >({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/transform-job/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id, tag_ids = [] }) =>
        invalidateTags(error, [
          listTag("transform-job"),
          idTag("transform-job", id),
          ...tag_ids.map((tagId) => idTag("transform-job-via-tag", tagId)),
        ]),
      onQueryStarted: async (
        { id, ...patch },
        { dispatch, queryFulfilled },
      ) => {
        const patchResult = dispatch(
          transformJobApi.util.updateQueryData(
            "getTransformJob",
            id,
            (draft) => {
              Object.assign(draft, patch);
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
    }),
    deleteTransformJob: builder.mutation<void, TransformJobId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/transform-job/${id}`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("transform-job")]),
    }),
    bulkUpdateTransformJobsActive: builder.mutation<
      { updated: number; failed: number },
      { active: boolean }
    >({
      query: (body) => ({
        method: "PUT",
        url: "/api/transform-job/active",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("transform-job")]),
    }),
  }),
});

export const {
  useListTransformJobsQuery,
  useListTransformJobTransformsQuery,
  useListAllDagRunsQuery,
  useCancelDagRunMutation,
  useListTransformJobRunsQuery,
  useListJobRunTransformRunsQuery,
  useGetTransformJobQuery,
  useLazyGetTransformJobQuery,
  useRunTransformJobMutation,
  useCreateTransformJobMutation,
  useUpdateTransformJobMutation,
  useDeleteTransformJobMutation,
  useBulkUpdateTransformJobsActiveMutation,
} = transformJobApi;
