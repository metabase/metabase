import { getSdkGlobalPlugins } from "embedding-sdk-shared/lib/sdk-global-plugins";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { createPlugin } from "metabase/lib/plugins-v2";
import { hasPremiumFeature } from "metabase-enterprise/settings";

const sdkOpenLinkPlugin = createPlugin("ee-sdk-open-link", ({ extend }) => {
  extend("dashboard.openLink", async (next, { url }) => {
    // Defensive: this plugin should only ever be loaded in the SDK runtime
    // (registered via metabase-enterprise/sdk-plugins), but bail anyway if
    // we somehow run outside the SDK so we don't intercept core navigation.
    if (!isEmbeddingSdk()) {
      return next({ url });
    }

    const globalPlugins = getSdkGlobalPlugins();
    if (!globalPlugins?.handleLink) {
      return next({ url });
    }

    // Intentionally not awaited: SDK contract asks customers for a sync
    // function; the validation below rejects Promise returns.
    const result = globalPlugins.handleLink(url);

    if (!result || typeof result !== "object" || !("handled" in result)) {
      throw new Error(
        "handleLink plugin must return an object with a 'handled' property",
      );
    }

    if (!result.handled) {
      return next({ url });
    }
  });
});

export const initializeHandleLinkPlugin = () => {
  if (hasPremiumFeature("embedding_sdk")) {
    sdkOpenLinkPlugin.activate();
  }
};
