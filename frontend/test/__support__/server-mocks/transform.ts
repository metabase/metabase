import fetchMock from "fetch-mock";

import type { TransformJobId } from "metabase-types/api";

export function setupDeleteTransformJobEndpoint(jobId: TransformJobId) {
  fetchMock.delete(`path:/api/ee/transform-job/${jobId}`, 200);
}

export function setupDeleteTransformJobEndpointWithError(
  jobId: TransformJobId,
) {
  fetchMock.delete(`path:/api/ee/transform-job/${jobId}`, 500);
}
