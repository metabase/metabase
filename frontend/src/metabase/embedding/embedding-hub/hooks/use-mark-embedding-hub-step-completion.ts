import { useUpdateSettingMutation } from "metabase/api";
import type { SettingKey } from "metabase-types/api";

import type { EmbeddingHubStepId } from "../types";

export const EMBEDDING_HUB_STEP_TO_SETTING_MAP: Partial<
  Record<EmbeddingHubStepId, SettingKey>
> = {
  "create-test-embed": "embedding-hub-test-embed-snippet-created",
  "embed-production": "embedding-hub-production-embed-snippet-created",
};

export function useMarkEmbeddingHubStepCompletion() {
  const [updateSetting] = useUpdateSettingMutation();

  function markEmbeddingHubStepAsComplete(stepId: EmbeddingHubStepId) {
    const settingKey = EMBEDDING_HUB_STEP_TO_SETTING_MAP[stepId] ?? null;

    if (settingKey !== null) {
      updateSetting({ key: settingKey, value: true });
    }
  }

  return { markEmbeddingHubStepAsComplete };
}
