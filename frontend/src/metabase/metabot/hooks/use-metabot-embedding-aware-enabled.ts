import { useSetting } from "metabase/common/hooks";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isWithinIframe } from "metabase/lib/dom";

/** Returns the value for `metabot-enabled?` or `embedded-metabot-enabled?` depending on the context
 * only if the metabot token feature is enabled.
 * Use `forceEmbedding` to always check the embedding setting (e.g. in the embed wizard). */
export const useMetabotEnabledEmbeddingAware = ({
  forceEmbedding = false,
}: {
  forceEmbedding?: boolean;
} = {}): boolean => {
  const isEmbedding = forceEmbedding || isWithinIframe() || isEmbeddingSdk();
  const isEnabled = useSetting(
    isEmbedding ? "embedded-metabot-enabled?" : "metabot-enabled?",
  );
  const isConfigured = !!useSetting("llm-metabot-configured?");

  return isEnabled && isConfigured;
};
