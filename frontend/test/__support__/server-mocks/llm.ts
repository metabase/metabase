import fetchMock from "fetch-mock";

import type { LLMModel } from "metabase-types/api";

export function setupLlmListModelsEndpoint(
  models: LLMModel[] = [],
  error: boolean = false,
) {
  if (error) {
    fetchMock.get(
      "path:/api/llm/list-models",
      {
        status: 500,
        body: { message: "Failed to fetch models" },
      },
      { name: "llm-list-models" },
    );
  } else {
    fetchMock.get(
      "path:/api/llm/list-models",
      { models },
      { name: "llm-list-models" },
    );
  }
}
