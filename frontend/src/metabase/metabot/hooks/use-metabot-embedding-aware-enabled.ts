import { useSetting } from "metabase/common/hooks";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isWithinIframe } from "metabase/lib/dom";
import type { EnterpriseSettingKey } from "metabase-types/api";

/** Returns the value for `is-metabot-enabled` or `is-embedded-metabot-enabled` depending on the context. */
export const useMetabotEnabledEmbeddingAware = (): boolean => {
  const isEmbeddingIframe = isWithinIframe() || isEmbeddingSdk();
  const settingName: EnterpriseSettingKey = isEmbeddingIframe
    ? "is-embedded-metabot-enabled"
    : "is-metabot-enabled";
  return useSetting(settingName);
};
