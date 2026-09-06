import { handleLinkSdkPlugin } from "embedding-sdk-shared/lib/sdk-global-plugins";
import { setHostLinkHandler } from "metabase/urls/host-navigation";

/**
 * The handleLink plugin is read on every call,
 * so the EE initializer that sets it later still takes effect.
 */
export function installSdkHostLinkHandler() {
  setHostLinkHandler(async (url: string) => {
    const { handled } = await handleLinkSdkPlugin(url);
    return handled;
  });
}
