import fetchMock from "fetch-mock";

import type { CacheConfig } from "metabase-types/api";
export function setupPerformanceEndpoints(cacheConfigs: CacheConfig[]) {
  let configs = [...cacheConfigs];

  // Mirrors GET /api/cache: `model` defaults to ["root"] and `id` narrows to
  // one model_id, so a request for the wrong models gets the wrong answer.
  fetchMock.get("path:/api/cache", ({ url }) => {
    const params = new URL(url, "http://localhost").searchParams;
    const models = params.getAll("model");
    const requestedModels = models.length > 0 ? models : ["root"];
    const id = params.get("id");
    return {
      data: configs.filter(
        (config) =>
          requestedModels.includes(config.model) &&
          (id === null || config.model_id === Number(id)),
      ),
    };
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
