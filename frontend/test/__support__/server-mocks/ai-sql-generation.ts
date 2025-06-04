import fetchMock from "fetch-mock";

import type { GenerateSqlQueryResponse } from "metabase-types/api";

export function setupGenerateSqlQueryEndpoint(
  response: GenerateSqlQueryResponse,
) {
  fetchMock.post("path:/api/ee/ai-sql-generation/generate", response);
}

export function setupErrorGenerateSqlQueryEndpoint() {
  fetchMock.post("path:/api/ee/ai-sql-generation/generate", 500);
}
