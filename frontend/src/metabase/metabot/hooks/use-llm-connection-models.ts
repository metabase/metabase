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

  return { connections, modelOptions, errorByConnectionKey, isLoading, error };
}

function getModelOptions(connections: LlmConnectionModels[]) {
  return connections
    .filter((connection) => connection.models.length > 0)
    .map((connection) => ({
      group: connection.name,
      items: connection.models.map((model) => ({
        value: `${connection.key}/${model.id}`,
        label: model.display_name,
      })),
    }));
}

function getErrorByConnectionKey(connections: LlmConnectionModels[]) {
  const entries = connections.flatMap((connection) =>
    connection.error ? [[connection.key, connection.error] as const] : [],
  );
  return Object.fromEntries(entries);
}
