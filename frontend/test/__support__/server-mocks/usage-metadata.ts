import fetchMock from "fetch-mock";

import type {
  CreateUsageMetadataCandidateResponse,
  UsageMetadataCandidateDetail,
  UsageMetadataCandidateSummary,
  UsageMetadataPage,
  UsageMetadataRefreshStatus,
  UsageMetadataTableSummary,
} from "metabase-types/api";

const BASE_URL = "/api/ee/data-studio/usage-metadata";

export function setupUsageMetadataTablesEndpoint(
  response: UsageMetadataPage<UsageMetadataTableSummary>,
) {
  fetchMock.get(`path:${BASE_URL}/tables`, response);
}

export function setupUsageMetadataCandidatesEndpoint(
  response: UsageMetadataPage<UsageMetadataCandidateSummary>,
) {
  fetchMock.get(`path:${BASE_URL}/candidates`, response);
}

export function setupUsageMetadataCandidateEndpoint(
  candidateId: number,
  response: UsageMetadataCandidateDetail,
) {
  fetchMock.get(`path:${BASE_URL}/candidates/${candidateId}`, response, {
    name: `usage-metadata-candidate-${candidateId}`,
  });
}

export function setupUsageMetadataRefreshEndpoint(
  response: UsageMetadataRefreshStatus,
) {
  fetchMock.get(`path:${BASE_URL}/refresh`, response);
}

export function setupStartUsageMetadataRefreshEndpoint(
  response: { run_id: number } | { status: number },
) {
  fetchMock.post(`path:${BASE_URL}/refresh`, response);
}

export function setupCreateUsageMetadataCandidateEndpoint(
  candidateId: number,
  response: CreateUsageMetadataCandidateResponse,
) {
  fetchMock.post(`path:${BASE_URL}/candidates/${candidateId}/create`, response);
}

export function setupDismissUsageMetadataCandidateEndpoint(
  candidateId: number,
) {
  fetchMock.post(`path:${BASE_URL}/candidates/${candidateId}/dismiss`, {});
}

export function setupRestoreUsageMetadataCandidateEndpoint(
  candidateId: number,
) {
  fetchMock.delete(`path:${BASE_URL}/candidates/${candidateId}/dismissal`, {});
}
