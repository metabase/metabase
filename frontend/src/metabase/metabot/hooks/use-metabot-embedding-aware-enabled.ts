import { useSetting } from "metabase/common/hooks";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isWithinIframe } from "metabase/utils/iframe";

/** Returns the value for `metabot-enabled?` or `embedded-metabot-enabled?` depending on the context
 * only if the metabot token feature is enabled.
 * By default, this also requires the provider configuration to be complete.
 * Use `forceEmbedding` to always check the embedding setting (e.g. in the embed wizard). */
export const useMetabotEnabledEmbeddingAware = ({
  forceEmbedding = false,
  requireConfiguration = true,
}: {
  forceEmbedding?: boolean;
  requireConfiguration?: boolean;
} = {}): boolean => {
  const isEmbedding = forceEmbedding || isWithinIframe() || isEmbeddingSdk();
  const isEnabled = useSetting(
    isEmbedding ? "embedded-metabot-enabled?" : "metabot-enabled?",
  );
  const isConfigured = !!useSetting("llm-metabot-configured?");

  return isEnabled && (!requireConfiguration || isConfigured);
};
