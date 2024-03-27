import fetchMock from "fetch-mock";

import type { Config as CacheConfig } from "metabase/admin/performance/types";
export function setupPerformanceEndpoints(cacheConfigs: CacheConfig[]) {
  fetchMock.get(
    {
      url: "path:/api/ee/caching",
    },
    { data: cacheConfigs },
  );

  fetchMock.put(
    {
      url: "path:/api/ee/caching",
    },
    {},
  );
}
