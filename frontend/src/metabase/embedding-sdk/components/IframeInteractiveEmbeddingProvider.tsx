import { Global } from "@emotion/react";
import { type JSX, type ReactNode, useEffect } from "react";

import { SCOPED_CSS_RESET } from "embedding-sdk/components/private/PublicComponentStylesWrapper";
import { SdkContextProvider } from "embedding-sdk/components/private/SdkContext";
import { SdkFontsGlobalStyles } from "embedding-sdk/components/private/SdkGlobalFontsStyles";
import {
  FullPagePortalContainer,
  PortalContainer,
} from "embedding-sdk/components/private/SdkPortalContainer";
import { SdkThemeProvider } from "embedding-sdk/components/private/SdkThemeProvider";
import { useInitData } from "embedding-sdk/hooks";
import type { SdkEventHandlersConfig } from "embedding-sdk/lib/events";
import {
  setErrorComponent,
  setEventHandlers,
  setLoaderComponent,
  setMetabaseClientUrl,
  setPlugins,
} from "embedding-sdk/store/reducer";
import type { SdkErrorComponent } from "embedding-sdk/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk/types";
import { EMBEDDING_SDK_ROOT_ELEMENT_ID } from "metabase/embedding-sdk/config";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import type { MetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { useStore } from "metabase/lib/redux";
import { LocaleProvider } from "metabase/public/LocaleProvider";
import { setIsEmbeddingSdk, setOptions } from "metabase/redux/embed";
import { Box } from "metabase/ui";

import "metabase/css/index.module.css";
import "metabase/css/vendor.css";

import S from "./IframeInteractiveEmbeddingProvider.module.css";

export interface MetabaseProviderProps {
  children: ReactNode;
  authConfig: MetabaseAuthConfig;
  pluginsConfig?: MetabasePluginsConfig;
  eventHandlers?: SdkEventHandlersConfig;
  theme?: MetabaseTheme;
  className?: string;

  /**
   * Defines the display language. Accepts an ISO language code such as `en` or `de`.
   * Defaults to `en`. Does not support country code suffixes (i.e. `en-US`)
   **/
  locale?: string;

  /** A custom loader component to display while the SDK is loading. */
  loaderComponent?: () => JSX.Element;

  /** A custom error component to display when the SDK encounters an error. */
  errorComponent?: SdkErrorComponent;

  /** Whether to allow logging to the DevTools console. Defaults to true. */
  allowConsoleLog?: boolean;
}

export const IframeInteractiveEmbeddingProvider = ({
  children,
  authConfig,
  pluginsConfig,
  eventHandlers,
  theme,
  className,
  locale = "en",
  errorComponent,
  loaderComponent,
  allowConsoleLog,
}: MetabaseProviderProps): JSX.Element => {
  const { fontFamily } = theme ?? {};
  const store = useStore();

  useInitData({ authConfig, allowConsoleLog });

  useEffect(() => {
    // Operate in the "Embedding SDK" mode
    store.dispatch(setIsEmbeddingSdk(true));
  }, [store]);

  useEffect(() => {
    if (fontFamily) {
      store.dispatch(setOptions({ font: fontFamily }));
    }
  }, [store, fontFamily]);

  useEffect(() => {
    store.dispatch(setPlugins(pluginsConfig || null));
  }, [store, pluginsConfig]);

  useEffect(() => {
    store.dispatch(setEventHandlers(eventHandlers || null));
  }, [store, eventHandlers]);

  useEffect(() => {
    store.dispatch(setLoaderComponent(loaderComponent ?? null));
  }, [store, loaderComponent]);

  useEffect(() => {
    store.dispatch(setErrorComponent(errorComponent ?? null));
  }, [store, errorComponent]);

  useEffect(() => {
    store.dispatch(setMetabaseClientUrl(authConfig.metabaseInstanceUrl));
  }, [store, authConfig.metabaseInstanceUrl]);

  return (
    <SdkContextProvider>
      <Global styles={SCOPED_CSS_RESET} />
      <SdkThemeProvider theme={theme}>
        <SdkFontsGlobalStyles baseUrl={authConfig.metabaseInstanceUrl} />
        <Box className={className} id={EMBEDDING_SDK_ROOT_ELEMENT_ID}>
          <LocaleProvider locale={locale}>{children}</LocaleProvider>

          <PortalContainer className={S.InteractivePortalContainer} />
          <FullPagePortalContainer />
        </Box>
      </SdkThemeProvider>
    </SdkContextProvider>
  );
};
