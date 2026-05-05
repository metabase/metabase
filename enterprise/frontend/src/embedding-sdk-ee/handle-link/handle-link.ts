import {
  MODULAR_EMBEDDING_HANDLE_LINK_PLUGIN,
  getSdkGlobalPlugins,
} from "embedding-sdk-shared/lib/sdk-global-plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

export const initializeHandleLinkPlugin = () => {
  if (hasPremiumFeature("embedding_sdk")) {
    MODULAR_EMBEDDING_HANDLE_LINK_PLUGIN.handleLink = async (url: string) => {
      const globalPlugins = getSdkGlobalPlugins();

      if (!globalPlugins?.handleLink) {
        return { handled: false };
      }

      const result = globalPlugins.handleLink(url);

      if (!result || typeof result !== "object" || !("handled" in result)) {
        throw new Error(
          "handleLink plugin must return an object with a 'handled' property",
        );
      }

      return result;
    };
  }
};
