import { useMemo } from "react";

import { useListLlmModelsQuery } from "metabase/api";
import type { LlmConnectionModels } from "metabase-types/api";

export function useLlmConnectionModels() {
  const { data: connections = [], isLoading, error } = useListLlmModelsQuery();

  const modelOptions = useMemo(
    () => getModelOptions(connections),
    [connections],
  );

  const errorByConnectionKey = useMemo(
    () => getErrorByConnectionKey(connections),
    [connections],
  );

  const modelNameByRef = useMemo(
    () => getModelNameByRef(connections),
    [connections],
  );

  return {
    connections,
    modelOptions,
    modelNameByRef,
    errorByConnectionKey,
    isLoading,
    error,
  };
}

// The label is what a closed Select shows, and a model name alone does not say which provider
// serves it. The dropdown renders [[modelNameByRef]] instead, where the group heading already does.
function getModelOptions(connections: LlmConnectionModels[]) {
  return connections
    .filter((connection) => connection.models.length > 0)
    .map((connection) => ({
      group: connection.name,
      items: connection.models.map((model) => ({
        value: `${connection.key}/${model.id}`,
        label: `${connection.name} · ${model.display_name}`,
      })),
    }));
}

function getModelNameByRef(connections: LlmConnectionModels[]) {
  return Object.fromEntries(
    connections.flatMap((connection) =>
      connection.models.map((model) => [
        `${connection.key}/${model.id}`,
        model.display_name,
      ]),
    ),
  );
}

function getErrorByConnectionKey(connections: LlmConnectionModels[]) {
  const entries = connections.flatMap((connection) =>
    connection.error ? [[connection.key, connection.error] as const] : [],
  );
  return Object.fromEntries(entries);
}
