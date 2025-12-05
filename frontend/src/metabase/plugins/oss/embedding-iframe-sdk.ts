import type { DashboardSubscriptionsButtonProps } from "embedding-sdk-bundle/components/public/subscriptions";

const getDefaultPluginEmbeddingIframeSdk = () => ({
  isEnabled: () => false,
  DashboardSubscriptionsButton: (
    _props: DashboardSubscriptionsButtonProps,
  ): JSX.Element | null => null,
});

export const PLUGIN_EMBEDDING_IFRAME_SDK = getDefaultPluginEmbeddingIframeSdk();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(
    PLUGIN_EMBEDDING_IFRAME_SDK,
    getDefaultPluginEmbeddingIframeSdk(),
  );
}
