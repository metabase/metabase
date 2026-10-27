import fetchMock from "fetch-mock";

import type {
  DagTransform,
  Dataset,
  InspectorLensId,
  ListTransformGraphRunsResponse,
  ListTransformJobRunsResponse,
  ListTransformRunsResponse,
  RunTransformDagResponse,
  RunTransformJobResponse,
  RunTransformResponse,
  Transform,
  TransformDagRunId,
  TransformId,
  TransformJob,
  TransformJobId,
  TransformJobRunId,
  TransformRunForJobRun,
  TransformTag,
} from "metabase-types/api";

import type { MockResponse } from "./types";

export function setupListTransformRunsEndpoint(
  response: ListTransformRunsResponse,
) {
  fetchMock.get(`path:/api/transform/run`, response);
}

export function setupListTransformGraphRunsEndpoint(
  response: ListTransformGraphRunsResponse,
) {
  fetchMock.get(`path:/api/transform/runs`, response);
}

export function setupListTransformsEndpoint(transforms: Transform[]) {
  fetchMock.get(`path:/api/transform`, transforms);
}

export function setupGetTransformEndpoint(transform: Transform) {
  fetchMock.get(`path:/api/transform/${transform.id}`, transform);
}

export function setupDeleteTransformEndpoint(transformId: TransformId) {
  fetchMock.delete(`path:/api/transform/${transformId}`, 204);
}

export function setupListTransformTagsEndpoint(tags: TransformTag[]) {
  fetchMock.get(`path:/api/transform-tag`, tags);
}

export function setupCreateTransformTagEndpoint(tag: TransformTag) {
  fetchMock.post(`path:/api/transform-tag`, tag);
}

export function setupListTransformJobsEndpoint(jobs: TransformJob[]) {
  fetchMock.get(`path:/api/transform-job`, jobs);
}

export function setupListTransformJobTransformsEndpoint(
  jobId: TransformJobId,
  transforms: Transform[],
  options?: { delay?: number },
) {
  fetchMock.get(
    `path:/api/transform-job/${jobId}/transforms`,
    transforms,
    options,
  );
}

export function setupListTransformJobTransformsEndpointWithError(
  jobId: TransformJobId,
  error?: unknown,
) {
  fetchMock.get(`path:/api/transform-job/${jobId}/transforms`, {
    status: 500,
    body: error,
  });
}

export function setupGetTransformJobEndpoint(
  job: TransformJob,
  response: MockResponse<TransformJob> = job,
) {
  fetchMock.get(`path:/api/transform-job/${job.id}`, response);
}

export function setupListTransformJobRunsEndpoint(
  jobId: TransformJobId,
  response: ListTransformJobRunsResponse | (() => ListTransformJobRunsResponse),
) {
  fetchMock.get(`path:/api/transform-job/${jobId}/runs`, response);
}

export function setupListJobRunTransformRunsEndpoint(
  jobId: TransformJobId,
  runId: TransformJobRunId,
  runs: TransformRunForJobRun[] | (() => TransformRunForJobRun[]),
) {
  fetchMock.get(
    `path:/api/transform-job/${jobId}/runs/${runId}/transform-runs`,
    runs,
  );
}

export function setupListDagTransformsEndpoint(
  transformId: TransformId,
  transforms: DagTransform[],
) {
  fetchMock.get(
    `path:/api/transform/${transformId}/dag-transforms`,
    transforms,
  );
}

export function setupRunTransformEndpoint(
  transformId: TransformId,
  response: MockResponse<RunTransformResponse>,
) {
  fetchMock.post(`path:/api/transform/${transformId}/run`, response);
}

export function setupCancelCurrentTransformRunEndpoint(
  transformId: TransformId,
  response: MockResponse<number> = 204,
) {
  fetchMock.post(`path:/api/transform/${transformId}/cancel`, response);
}

export function setupRunTransformDagEndpoint(
  transformId: TransformId,
  response: RunTransformDagResponse = {
    message: "DAG run started",
    dag_run_id: 1,
  },
) {
  fetchMock.post(`path:/api/transform/${transformId}/run-dag`, response);
}

export function setupListDagRunTransformRunsEndpoint(
  dagRunId: TransformDagRunId,
  runs: TransformRunForJobRun[] | (() => TransformRunForJobRun[]),
) {
  fetchMock.get(`path:/api/transform-dag-run/${dagRunId}/transform-runs`, runs);
}

export function setupCancelJobRunEndpoint(
  jobId: TransformJobId,
  runId: TransformJobRunId,
) {
  fetchMock.post(`path:/api/transform-job/${jobId}/runs/${runId}/cancel`, 204);
}

export function setupCreateTransformJobEndpoint(job: TransformJob) {
  fetchMock.post("path:/api/transform-job", job);
}

export function setupUpdateTransformJobEndpoint(job: TransformJob) {
  fetchMock.put(`path:/api/transform-job/${job.id}`, job);
}

export function setupBulkUpdateTransformJobsActiveEndpoint(updated: number) {
  fetchMock.put("path:/api/transform-job/active", { updated });
}

export function setupRunTransformJobEndpoint(
  jobId: TransformJobId,
  response: MockResponse<RunTransformJobResponse> = {
    message: "Job run started",
    job_run_id: 1,
  },
) {
  fetchMock.post(`path:/api/transform-job/${jobId}/run`, response);
}

export function setupDeleteTransformJobEndpoint(jobId: TransformJobId) {
  fetchMock.delete(`path:/api/transform-job/${jobId}`, 200);
}

export function setupDeleteTransformJobEndpointWithError(
  jobId: TransformJobId,
) {
  fetchMock.delete(`path:/api/transform-job/${jobId}`, 500);
}

export function setupRunInspectorQueryEndpoint(
  transformId: TransformId,
  lensId: InspectorLensId,
  response: Dataset,
) {
  fetchMock.post(
    `path:/api/ee/transforms/${transformId}/inspect/${lensId}/query`,
    response,
  );
}
