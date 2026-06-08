import { SdkThemeProvider } from "embedding-sdk-bundle/components/private/SdkThemeProvider";
import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
import { getHostBackedSdkStore } from "metabase/data_apps/host-sdk-init";
import { MetabaseReduxProvider } from "metabase/redux";

// Note: Mantine + SDK CSS is loaded into the iframe via the `data-app-vendors`
// Rspack entry (`<link rel="stylesheet">` in the iframe srcdoc). Don't side-
// effect-import CSS here — those imports run at parent-bundle eval and land
// in the host document, not the iframe.

/**
 * In-host equivalent of the SDK's `MetabaseProvider` / `ComponentProvider`:
 * provides the SDK Redux store (pre-initialized, no auth handshake) and the
 * SDK theme provider in one go.
 */
export const DataAppProvider = ({ theme, children }: MetabaseProviderProps) => {
  const sdkStore = getHostBackedSdkStore();

  return (
    <MetabaseReduxProvider store={sdkStore}>
      <SdkThemeProvider theme={theme}>{children}</SdkThemeProvider>
    </MetabaseReduxProvider>
  );
};
