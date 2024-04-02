import fetchMock from "fetch-mock";

import type { Config as CacheConfig } from "metabase/admin/performance/types";
export function setupPerformanceEndpoints(cacheConfigs: CacheConfig[]) {
  fetchMock.get(
    {
      url: "path:/api/cache",
    },
    { data: cacheConfigs },
  );

  fetchMock.put(
    {
      url: "path:/api/cache",
    },
    {},
  );
  fetchMock.delete(
    {
      url: "path:/api/cache",
    },
    {},
  );
}
