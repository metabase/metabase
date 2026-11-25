import fetchMock from "fetch-mock";

import type { CardId, ModelIndex } from "metabase-types/api";
import { createMockModelIndex } from "metabase-types/api/mocks";

export function setupModelIndexEndpoints(
  modelId: CardId,
  indexes: ModelIndex[] = [],
) {
  fetchMock.get({
    url: `path:/api/model-index`,
    query: { model_id: modelId },
    response: indexes,
    name: `getModelIndexes-${modelId}`,
  });

  indexes.forEach((index) => {
    fetchMock.delete(`path:/api/model-index/${index.id}`, 200, {
      name: `deleteModelIndex`,
    });
  });

  fetchMock.post(
    `path:/api/model-index`,
    async (call) => {
      const lastCall = fetchMock.callHistory.lastCall(call.url);
      return createMockModelIndex(await lastCall?.request?.json());
    },
    { name: `createModelIndex` },
  );
}

type ModelIndexCreateBody = Pick<
  ModelIndex,
  "model_id" | "pk_ref" | "value_ref"
>;

function parseModelIndexCreateBody(body: unknown): ModelIndexCreateBody {
  const parsed: unknown = JSON.parse(String(body));
  if (
    typeof parsed !== "object" ||
    parsed == null ||
    !("model_id" in parsed) ||
    typeof parsed.model_id !== "number" ||
    !("pk_ref" in parsed) ||
    !Array.isArray(parsed.pk_ref) ||
    !("value_ref" in parsed) ||
    !Array.isArray(parsed.value_ref)
  ) {
    throw new Error(`Unexpected model index body: ${String(body)}`);
  }
  // Checked above to be arrays; the refs are passed through as the client sent them.
  const { model_id, pk_ref, value_ref } = parsed as ModelIndexCreateBody;
  return { model_id, pk_ref, value_ref };
}

/**
 * Model index endpoints backed by an in-memory list, so that a created index is
 * listed and a deleted one is not, like on the server.
 */
export function setupStatefulModelIndexEndpoints({
  modelId,
  nextIndexId,
}: {
  modelId: CardId;
  nextIndexId: number;
}) {
  let indexes: ModelIndex[] = [];
  let indexId = nextIndexId;

  fetchMock.get({
    url: "path:/api/model-index",
    query: { model_id: modelId },
    response: () => indexes,
    name: `stateful-model-index-list-${modelId}`,
  });

  fetchMock.post(
    "path:/api/model-index",
    (call) => {
      const index = createMockModelIndex({
        ...parseModelIndexCreateBody(call.options.body),
        id: indexId++,
      });
      indexes = [...indexes, index];
      return index;
    },
    { name: "stateful-model-index-create" },
  );

  fetchMock.delete(
    "express:/api/model-index/:id",
    (call) => {
      const id = Number(new URL(call.url).pathname.split("/").pop());
      const exists = indexes.some((index) => index.id === id);
      indexes = indexes.filter((index) => index.id !== id);
      return exists ? 200 : 404;
    },
    { name: "stateful-model-index-delete" },
  );
}
