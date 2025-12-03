import fetchMock from "fetch-mock";

import type { CacheConfig } from "metabase-types/api";
export function setupPerformanceEndpoints(cacheConfigs: CacheConfig[]) {
  fetchMock.get("path:/api/cache", { data: cacheConfigs });
  fetchMock.put("path:/api/cache", {});
  fetchMock.delete("path:/api/cache", {});
}
