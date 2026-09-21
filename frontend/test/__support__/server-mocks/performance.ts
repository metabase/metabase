import fetchMock from "fetch-mock";

import type { CacheConfig } from "metabase-types/api";
export function setupPerformanceEndpoints(cacheConfigs: CacheConfig[]) {
  let configs = [...cacheConfigs];

  fetchMock.get("path:/api/cache", () => {
    return { data: configs };
  });

  fetchMock.put("path:/api/cache", ({ options }) => {
    // Unjustified type cast. FIXME
    const body = JSON.parse(options.body as string);
    // Configs are keyed on model + model_id: a question and a dashboard can
    // share the same model_id
    configs = [
      ...configs.filter(
        (config) =>
          config.model !== body.model || config.model_id !== body.model_id,
      ),
      body,
    ];
    return {};
  });

  fetchMock.delete("path:/api/cache", ({ options }) => {
    // Unjustified type cast. FIXME
    const body = JSON.parse(options.body as string);
    const modelIds = Array.isArray(body.model_id)
      ? body.model_id
      : [body.model_id];
    configs = configs.filter(
      (config) =>
        config.model !== body.model || !modelIds.includes(config.model_id),
    );
    return {};
  });
}
