import type { SdkStoreState } from "embedding-sdk-bundle/store/types";
import { PLUGIN_SELECTORS } from "metabase/plugins";
import type { State } from "metabase-types/store";

// Store the original selector function to preserve Enterprise/OSS behavior
const originalGetNoDataIllustration = PLUGIN_SELECTORS.getNoDataIllustration;

/**
 * Initialize SDK plugins by overriding core plugin selectors to be SDK-aware.
 * This allows the SDK to provide custom implementations while maintaining
 * backward compatibility with Enterprise and OSS versions.
 */
export const initializeSdkPlugins = () => {
  // Override the selector to be SDK-aware
  PLUGIN_SELECTORS.getNoDataIllustration = (state: State) => {
    try {
      // Check if we're in an SDK context with plugins
      const sdkState = (state as SdkStoreState).sdk;
      if (sdkState?.plugins?.getNoDataIllustration) {
        const sdkResult = sdkState.plugins.getNoDataIllustration();
        if (sdkResult !== null && sdkResult !== undefined) {
          return sdkResult;
        }
      }
    } catch (error) {
      // Log error but don't break the application
      console.error("Error in SDK getNoDataIllustration plugin:", error);
    }

    // Fall back to original Enterprise/OSS behavior
    return originalGetNoDataIllustration(state);
  };
};
