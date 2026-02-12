import fetchMock from "fetch-mock";

import type {
  ListTransformRunsResponse,
  Transform,
  TransformJob,
  TransformJobId,
  TransformTag,
} from "metabase-types/api";

export function setupListTransformRunsEndpoint(
  response: ListTransformRunsResponse,
) {
  fetchMock.get(`path:/api/transform/run`, response);
}

export function setupListTransformsEndpoint(transforms: Transform[]) {
  fetchMock.get(`path:/api/transform`, transforms);
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
) {
  fetchMock.get(`path:/api/transform-job/${jobId}/transforms`, transforms);
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

export function setupGetTransformJobEndpoint(job: TransformJob) {
  fetchMock.get(`path:/api/transform-job/${job.id}`, job);
}

export function setupCreateTransformJobEndpoint(job: TransformJob) {
  fetchMock.post("path:/api/transform-job", job);
}

export function setupUpdateTransformJobEndpoint(job: TransformJob) {
  fetchMock.put(`path:/api/transform-job/${job.id}`, job);
}

export function setupRunTransformJobEndpoint(jobId: TransformJobId) {
  fetchMock.post(`path:/api/transform-job/${jobId}/run`, 200);
}

export function setupDeleteTransformJobEndpoint(jobId: TransformJobId) {
  fetchMock.delete(`path:/api/transform-job/${jobId}`, 200);
}

export function setupDeleteTransformJobEndpointWithError(
  jobId: TransformJobId,
) {
  fetchMock.delete(`path:/api/transform-job/${jobId}`, 500);
}
