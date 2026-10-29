import fetchMock from "fetch-mock";

import type {
  ConcreteTableId,
  MetadataGenerationApplyResult,
  MetadataGenerationEstimate,
  MetadataGenerationProposal,
  MetadataGenerationProposalTable,
  MetadataGenerationRun,
} from "metabase-types/api";

export function setupGetMetadataGenerationRunEndpoint(
  run: MetadataGenerationRun,
) {
  fetchMock.get(`path:/api/ee/data-sensitivity/runs/${run.id}`, run);
}

export function setupGetMetadataGenerationRunErrorEndpoint(
  runId: MetadataGenerationRun["id"],
  status: number,
) {
  fetchMock.get(`path:/api/ee/data-sensitivity/runs/${runId}`, { status });
}

/** Calling it again replaces the runs that the endpoint returns. */
export function setupListMetadataGenerationRunsEndpoint(
  runs: MetadataGenerationRun[],
) {
  const name = "metadata-generation-runs";
  fetchMock.removeRoute(name);
  fetchMock.get("path:/api/ee/data-sensitivity/runs", runs, { name });
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

export function setupListMetadataGenerationProposalTablesEndpoint(
  tables: MetadataGenerationProposalTable[],
) {
  fetchMock.get("path:/api/ee/data-sensitivity/proposals/tables", tables);
}

export function setupListMetadataGenerationProposalsEndpoint(
  tableId: ConcreteTableId,
  proposals: MetadataGenerationProposal[],
) {
  const name = `metadata-generation-proposals-${tableId}`;
  fetchMock.removeRoute(name);
  fetchMock.get("path:/api/ee/data-sensitivity/proposals", proposals, {
    name,
    query: { "table-id": String(tableId) },
  });
}

export function setupApplyMetadataGenerationProposalsEndpoint(
  result: MetadataGenerationApplyResult,
) {
  fetchMock.post("path:/api/ee/data-sensitivity/proposals/apply", result);
}
