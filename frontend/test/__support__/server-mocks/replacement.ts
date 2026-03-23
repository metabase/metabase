import fetchMock from "fetch-mock";

import type {
  ReplaceModelWithTableResponse,
  ReplaceModelWithTransformResponse,
  SourceReplacementRun,
} from "metabase-types/api";

export function setupListSourceReplacementRunsEndpoint(
  runs: SourceReplacementRun[],
) {
  fetchMock.get("path:/api/ee/replacement/runs", runs);
}

export function setupReplaceModelWithTableEndpoint(
  response: ReplaceModelWithTableResponse = { run_id: 1 },
) {
  fetchMock.post("path:/api/ee/replacement/replace-model-with-table", response);
}

export function setupReplaceModelWithTransformEndpoint(
  response: ReplaceModelWithTransformResponse = { run_id: 1 },
) {
  fetchMock.post(
    "path:/api/ee/replacement/replace-model-with-transform",
    response,
  );
}
