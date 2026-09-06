import { handleLinkSdkPlugin } from "embedding-sdk-shared/lib/sdk-global-plugins";
// Deep import (not the `metabase/urls` barrel) to keep the SDK bundle lean.
import { setHostLinkHandler } from "metabase/urls/host-navigation";

/**
 * The handler reads the `handleLink` plugin on every call.
 * The EE initializer that installs the host app's own plugin runs after this one.
 */
export function installSdkHostLinkHandler() {
  setHostLinkHandler(async (url: string) => {
    const { handled } = await handleLinkSdkPlugin(url);
    return handled;
  });
}
