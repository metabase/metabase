import fetchMock from "fetch-mock";

import type { FixSqlQueryResponse } from "metabase-types/api";

export function setupFixNativeQueryEndpoint(response: FixSqlQueryResponse) {
  fetchMock.post("path:/api/ee/ai-sql-fixer/fix", response);
}

export function setupErrorFixNativeQueryEndpoint() {
  fetchMock.post("path:/api/ee/ai-sql-fixer/fix", 500);
}
