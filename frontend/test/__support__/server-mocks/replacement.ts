import fetchMock from "fetch-mock";

import type {
  ReplaceModelWithTransformResponse,
  SourceReplacementRun,
} from "metabase-types/api";

export function setupListSourceReplacementRunsEndpoint(
  runs: SourceReplacementRun[],
) {
  fetchMock.get("path:/api/ee/replacement/runs", runs);
}

export function setupReplaceModelWithTransformEndpoint(
  response: ReplaceModelWithTransformResponse = { run_id: 1 },
) {
  fetchMock.post(
    "path:/api/ee/replacement/replace-model-with-transform",
    response,
  );
}
