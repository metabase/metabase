import type { ReactNode } from "react";

import { PortalContainer } from "embedding-sdk-bundle/components/private/SdkPortalContainer";
import { SdkThemeProvider } from "embedding-sdk-bundle/components/private/SdkThemeProvider";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { getHostBackedSdkStore } from "metabase/data_apps/host-sdk-init";
import { MetabaseReduxProvider } from "metabase/redux";

// Note: Mantine + SDK CSS is loaded into the iframe via the `data-app-vendors`
// Rspack entry (`<link rel="stylesheet">` in the iframe srcdoc). Don't side-
// effect-import CSS here — those imports run at parent-bundle eval and land
// in the host document, not the iframe.

interface DataAppProviderProps {
  theme?: MetabaseTheme;
  children?: ReactNode;
}

/**
 * In-host equivalent of the SDK's `MetabaseProvider` / `ComponentProvider`:
 * provides the SDK Redux store (pre-initialized, no auth handshake), the
 * SDK theme provider, and the portal container the SDK's Mantine
 * components (drill popups, dropdowns, modals) target via
 * `#metabase-sdk-portal-root`. Without `PortalContainer` rendered, those
 * overlays mount to `document.body` or silently fail.
 *
 * Takes only `{ theme, children }` — no `authConfig`. The data-app surface
 * inherits the host's session cookie; auth is already established.
 */
export const DataAppProvider = ({ theme, children }: DataAppProviderProps) => {
  const sdkStore = getHostBackedSdkStore();

  return (
    <MetabaseReduxProvider store={sdkStore}>
      <SdkThemeProvider theme={theme}>
        {children}
        <PortalContainer />
      </SdkThemeProvider>
    </MetabaseReduxProvider>
  );
};
