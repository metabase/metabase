import { useHasTokenFeature, useSetting } from "metabase/common/hooks";

import { useMetabotEnabledEmbeddingAware } from "./use-metabot-embedding-aware-enabled";

/**
 * Returns whether LLM SQL generation is available and enabled.
 *
 * Enterprise path: metabot_v3 feature is enabled AND metabot is enabled (embedding-aware)
 * OSS path: not hosted AND Anthropic API key is configured
 */
export const useLlmSqlGenerationEnabled = (): boolean => {
  const hasMetabotV3 = useHasTokenFeature("metabot_v3");
  const isMetabotEnabled = useMetabotEnabledEmbeddingAware();
  const isHosted = useSetting("is-hosted?");
  const isAnthropicConfigured = useSetting("llm-anthropic-api-key-configured?");

  // Enterprise: metabot_v3 feature + metabot enabled
  if (hasMetabotV3) {
    return isMetabotEnabled;
  }

  // OSS: not hosted + Anthropic API key configured
  return !isHosted && !!isAnthropicConfigured;
};
