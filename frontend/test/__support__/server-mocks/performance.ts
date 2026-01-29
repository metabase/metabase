import fetchMock from "fetch-mock";

import type { CacheConfig } from "metabase-types/api";
export function setupPerformanceEndpoints(cacheConfigs: CacheConfig[]) {
  let configs = [...cacheConfigs];

  fetchMock.get("path:/api/cache", () => {
    return { data: configs };
  });

  fetchMock.put("path:/api/cache", ({ options }) => {
    const body = JSON.parse(options.body as string);
    configs = [
      ...configs.filter((config) => config.model_id !== body.model_id),
      body,
    ];
    return {};
  });

  fetchMock.delete("path:/api/cache", ({ options }) => {
    const body = JSON.parse(options.body as string);
    configs = configs.filter((config) => config.model_id !== body.model_id);
    return {};
  });
}
