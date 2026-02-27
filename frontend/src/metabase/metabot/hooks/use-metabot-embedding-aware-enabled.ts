import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isWithinIframe } from "metabase/lib/dom";

/** Returns the value for `metabot-enabled?` or `embedded-metabot-enabled?` depending on the context
 * only if the metabot token feature is enabled. */
export const useMetabotEnabledEmbeddingAware = (): boolean => {
  const hasMetabotV3 = useHasTokenFeature("metabot_v3");
  const isEmbeddingIframe = isWithinIframe() || isEmbeddingSdk();
  const isEnabled = useSetting(
    isEmbeddingIframe ? "embedded-metabot-enabled?" : "metabot-enabled?",
  );
  return hasMetabotV3 && isEnabled;
};
