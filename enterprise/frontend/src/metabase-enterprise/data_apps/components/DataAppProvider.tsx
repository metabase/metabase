import createCache from "@emotion/cache";
import { CacheProvider, Global } from "@emotion/react";
import { type ReactNode, useMemo } from "react";

import { SCOPED_CSS_RESET } from "embedding-sdk-bundle/components/private/PublicComponentStylesWrapper";
import { PortalContainer } from "embedding-sdk-bundle/components/private/SdkPortalContainer";
import { SdkThemeProvider } from "embedding-sdk-bundle/components/private/SdkThemeProvider";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { MetabaseReduxProvider } from "metabase/redux";
import { getCspNonce } from "metabase/utils/csp";

import { useHostSdkStore } from "../lib/use-host-sdk-store";

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
export const DataAppProvider = (props: DataAppProviderProps) => {
  const { children, ...restProps } = props;
  const { theme } = restProps;
  const sdkStore = useHostSdkStore(restProps);

  // Iframe-side Emotion cache: keyed + CSP-nonced so SDK/Mantine styles inject
  // into this document's head (not the parent's).
  const emotionCache = useMemo(
    () => createCache({ key: "data-app", nonce: getCspNonce() ?? undefined }),
    [],
  );

  return (
    <CacheProvider value={emotionCache}>
      <MetabaseReduxProvider store={sdkStore}>
        <SdkThemeProvider theme={theme}>
          <Global styles={SCOPED_CSS_RESET} />

          {children}

          <PortalContainer />
        </SdkThemeProvider>
      </MetabaseReduxProvider>
    </CacheProvider>
  );
};
