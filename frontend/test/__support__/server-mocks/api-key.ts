import fetchMock from "fetch-mock";

import type { ApiKey } from "metabase-types/api";

export function setupApiKeyEndpoints(apiKeys: ApiKey[]) {
  fetchMock.get("path:/api/api-key", apiKeys);
  fetchMock.get("path:/api/api-key/count", apiKeys.length);
  fetchMock.post("path:/api/api-key", 200);
}
