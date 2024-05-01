import fetchMock from "fetch-mock";

import type { Config as CacheConfig } from "metabase-types/api";
export function setupPerformanceEndpoints(cacheConfigs: CacheConfig[]) {
  fetchMock.get({ url: "path:/api/cache" }, { data: cacheConfigs });
  fetchMock.put({ url: "path:/api/cache" }, {});
  fetchMock.delete({ url: "path:/api/cache" }, {});
}
