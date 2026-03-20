import { useSetting } from "metabase/common/hooks";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isWithinIframe } from "metabase/lib/dom";
import { PLUGIN_METABOT } from "metabase/plugins";

/** Returns the value for `metabot-enabled?` or `embedded-metabot-enabled?` depending on the context
 * only if the metabot token feature is enabled.
 * Use `forceEmbedding` to always check the embedding setting (e.g. in the embed wizard). */
export const useMetabotEnabledEmbeddingAware = ({
  forceEmbedding = false,
  requireMetabotEnabled = true,
}: {
  forceEmbedding?: boolean;
  requireMetabotEnabled?: boolean;
} = {}): boolean => {
  const isEmbedding = forceEmbedding || isWithinIframe() || isEmbeddingSdk();
  const isEnabled = useSetting(
    isEmbedding ? "embedded-metabot-enabled?" : "metabot-enabled?",
  );
  return (!requireMetabotEnabled || PLUGIN_METABOT.hasFeature) && isEnabled;
};
