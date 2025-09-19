import fetchMock from "fetch-mock";

import type {
  TransformJob,
  TransformJobId,
  TransformTag,
} from "metabase-types/api";

export function setupListTransformTagsEndpoint(tags: TransformTag[]) {
  fetchMock.get(`path:/api/ee/transform-tag`, tags);
}

export function setupCreateTransformTagEndpoint(tag: TransformTag) {
  fetchMock.post(`path:/api/ee/transform-tag`, tag);
}

export function setupGetTransformJobEndpoint(job: TransformJob) {
  fetchMock.get(`path:/api/ee/transform-job/${job.id}`, job);
}

export function setupCreateTransformJobEndpoint(job: TransformJob) {
  fetchMock.post("path:/api/ee/transform-job", job);
}

export function setupUpdateTransformJobEndpoint(job: TransformJob) {
  fetchMock.put(`path:/api/ee/transform-job/${job.id}`, job);
}

export function setupRunTransformJobEndpoint(jobId: TransformJobId) {
  fetchMock.post(`path:/api/ee/transform-job/${jobId}/run`, 200);
}

export function setupDeleteTransformJobEndpoint(jobId: TransformJobId) {
  fetchMock.delete(`path:/api/ee/transform-job/${jobId}`, 200);
}

export function setupDeleteTransformJobEndpointWithError(
  jobId: TransformJobId,
) {
  fetchMock.delete(`path:/api/ee/transform-job/${jobId}`, 500);
}
