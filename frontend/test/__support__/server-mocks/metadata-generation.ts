import fetchMock from "fetch-mock";

import type {
  MetadataGenerationApplyResult,
  MetadataGenerationEstimate,
  MetadataGenerationRun,
  MetadataGenerationRunId,
  MetadataGenerationRunTable,
  MetadataGenerationSuggestion,
} from "metabase-types/api";

export function setupListMetadataGenerationRunsEndpoint(
  runs: MetadataGenerationRun[],
) {
  fetchMock.get("path:/api/ee/data-sensitivity/runs", runs);
}

export function setupGetMetadataGenerationRunEndpoint(
  run: MetadataGenerationRun,
) {
  fetchMock.get(`path:/api/ee/data-sensitivity/runs/${run.id}`, run);
}

export function setupMetadataGenerationEstimateEndpoint(
  estimate: MetadataGenerationEstimate,
) {
  fetchMock.get("path:/api/ee/data-sensitivity/runs/estimate", estimate);
}

export function setupStartMetadataGenerationRunEndpoint(
  run: MetadataGenerationRun,
) {
  fetchMock.post("path:/api/ee/data-sensitivity/runs", run);
}

export function setupStartMetadataGenerationRunErrorEndpoint(
  status: number,
  message: string,
) {
  fetchMock.post("path:/api/ee/data-sensitivity/runs", {
    status,
    body: { message },
  });
}

export function setupCancelMetadataGenerationRunEndpoint(
  run: MetadataGenerationRun,
) {
  fetchMock.post(`path:/api/ee/data-sensitivity/runs/${run.id}/cancel`, run);
}

export function setupRetryFailedMetadataGenerationRunEndpoint(
  runId: MetadataGenerationRun["id"],
  newRun: MetadataGenerationRun,
) {
  fetchMock.post(
    `path:/api/ee/data-sensitivity/runs/${runId}/retry-failed`,
    newRun,
  );
}

export function setupListMetadataGenerationRunTablesEndpoint(
  runId: MetadataGenerationRunId,
  tables: MetadataGenerationRunTable[],
) {
  fetchMock.get(`path:/api/ee/data-sensitivity/runs/${runId}/tables`, tables);
}

export function setupListMetadataGenerationSuggestionsEndpoint(
  runId: MetadataGenerationRunId,
  tableId: MetadataGenerationRunTable["table_id"],
  suggestions: MetadataGenerationSuggestion[],
) {
  fetchMock.get(
    `path:/api/ee/data-sensitivity/runs/${runId}/tables/${tableId}/suggestions`,
    suggestions,
  );
}

export function setupDecideMetadataGenerationSuggestionsEndpoint(
  runId: MetadataGenerationRunId,
  updated = 1,
) {
  fetchMock.post(`path:/api/ee/data-sensitivity/runs/${runId}/decisions`, {
    updated,
  });
}

export function setupApplyMetadataGenerationRunEndpoint(
  runId: MetadataGenerationRunId,
  result: MetadataGenerationApplyResult,
) {
  fetchMock.post(`path:/api/ee/data-sensitivity/runs/${runId}/apply`, result);
}
