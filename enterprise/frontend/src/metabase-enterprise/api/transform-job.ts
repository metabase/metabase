import type {
  CreateTransformJobRequest,
  Transform,
  TransformJob,
  TransformJobId,
  UpdateTransformJobRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideTransformJobListTags,
  provideTransformJobTags,
  provideTransformTags,
  tag,
} from "./tags";

export const transformJobApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listTransformJobs: builder.query<TransformJob[], void>({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/transform-job",
        params,
      }),
      providesTags: (jobs = []) => provideTransformJobListTags(jobs),
    }),
    getTransformJob: builder.query<TransformJob, TransformJobId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/transform-job/${id}`,
      }),
      providesTags: (job) => (job ? provideTransformJobTags(job) : []),
    }),
    listTransformJobTransforms: builder.query<Transform[], TransformJobId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/transform-job/${id}/transforms`,
      }),
      providesTags: (transforms, error, id) =>
        invalidateTags(error, [
          idTag("transform-job", id),
          ...(transforms?.flatMap(provideTransformTags) ?? []),
        ]),
    }),
    runTransformJob: builder.mutation<void, TransformJobId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/transform-job/${id}/run`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          idTag("transform-job", id),
          tag("transform"),
          tag("table"),
        ]),
    }),
    createTransformJob: builder.mutation<
      TransformJob,
      CreateTransformJobRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/transform-job",
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
        url: `/api/ee/transform-job/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("transform-job", id)]),
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
        url: `/api/ee/transform-job/${id}`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("transform-job")]),
    }),
  }),
});

export const {
  useListTransformJobsQuery,
  useListTransformJobTransformsQuery,
  useGetTransformJobQuery,
  useLazyGetTransformJobQuery,
  useRunTransformJobMutation,
  useCreateTransformJobMutation,
  useUpdateTransformJobMutation,
  useDeleteTransformJobMutation,
} = transformJobApi;
