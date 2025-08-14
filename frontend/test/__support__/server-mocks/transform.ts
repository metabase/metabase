import fetchMock from "fetch-mock";

import type { TransformJob, TransformJobId } from "metabase-types/api";

export function setupGetTransformJobEndpoint(job: TransformJob) {
  fetchMock.get(`path:/api/ee/transform-job/${job.id}`, job);
}

export function setupCreateTransformJobEndpoint(job: TransformJob) {
  fetchMock.post("path:/api/ee/transform-job", job);
}

export function setupDeleteTransformJobEndpoint(jobId: TransformJobId) {
  fetchMock.delete(`path:/api/ee/transform-job/${jobId}`, 200);
}

export function setupDeleteTransformJobEndpointWithError(
  jobId: TransformJobId,
) {
  fetchMock.delete(`path:/api/ee/transform-job/${jobId}`, 500);
}
