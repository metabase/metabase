import type { SdkStoreState } from "embedding-sdk-bundle/store/types";
import type { MetabaseGlobalPluginsConfig } from "embedding-sdk-package";
import { PLUGIN_SELECTORS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { State } from "metabase-types/store";

// Flag to ensure initialization happens only once
let isInitialized = false;

// For testing purposes - allows resetting initialization state
export const resetInitialization = () => {
  isInitialized = false;
};

/**
 * Initialize SDK plugins by overriding core plugin selectors to be SDK-aware.
 * This allows the SDK to provide custom implementations while maintaining
 * backward compatibility with Enterprise and OSS versions.
 */
export const initializePlugin = () => {
  if (!hasPremiumFeature("whitelabel")) {
    return;
  }

  if (isInitialized) {
    return;
  }
  // Store the original selector functions to preserve Enterprise/OSS behavior
  const originalGetNoDataIllustration = PLUGIN_SELECTORS.getNoDataIllustration;
  const originalGetNoObjectIllustration =
    PLUGIN_SELECTORS.getNoObjectIllustration;

  isInitialized = true;

  // Override the selectors to be SDK-aware
  PLUGIN_SELECTORS.getNoDataIllustration = (state: State) => {
    try {
      // Check if we're in an SDK context with plugins
      const plugins = (state as SdkStoreState).sdk
        ?.plugins as MetabaseGlobalPluginsConfig;
      const sdkResult = plugins?.getNoDataIllustration?.();
      if (sdkResult !== null && sdkResult !== undefined) {
        return sdkResult;
      }
    } catch (error) {
      // Log error but don't break the application
      console.error("Error in SDK getNoDataIllustration plugin:", error);
    }

    // Fall back to original Enterprise/OSS behavior
    return originalGetNoDataIllustration(state);
  };

  PLUGIN_SELECTORS.getNoObjectIllustration = (state: State) => {
    try {
      // Check if we're in an SDK context with plugins
      const plugins = (state as SdkStoreState).sdk
        ?.plugins as MetabaseGlobalPluginsConfig;
      const sdkResult = plugins?.getNoObjectIllustration?.();
      if (sdkResult !== null && sdkResult !== undefined) {
        return sdkResult;
      }
    } catch (error) {
      // Log error but don't break the application
      console.error("Error in SDK getNoObjectIllustration plugin:", error);
    }

    // Fall back to original Enterprise/OSS behavior
    return originalGetNoObjectIllustration(state);
  };
};
