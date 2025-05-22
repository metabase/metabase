import { Global } from "@emotion/react";
import type { Action, Store } from "@reduxjs/toolkit";
import { type JSX, type ReactNode, memo, useEffect, useRef } from "react";

import { SdkThemeProvider } from "embedding-sdk/components/private/SdkThemeProvider";
import { useInitData } from "embedding-sdk/hooks";
import { getSdkStore } from "embedding-sdk/store";
import {
  setErrorComponent,
  setEventHandlers,
  setLoaderComponent,
  setMetabaseClientUrl,
  setPlugins,
} from "embedding-sdk/store/reducer";
import type { SdkStoreState } from "embedding-sdk/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk/types/auth-config";
import type { SdkEventHandlersConfig } from "embedding-sdk/types/events";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import type { CommonStylingProps } from "embedding-sdk/types/props";
import type { SdkErrorComponent } from "embedding-sdk/types/ui";
import { EMBEDDING_SDK_ROOT_ELEMENT_ID } from "metabase/embedding-sdk/config";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { LocaleProvider } from "metabase/public/LocaleProvider";
import { setOptions } from "metabase/redux/embed";
import { getSetting } from "metabase/selectors/settings";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { Box } from "metabase/ui";
import { MetabotProvider } from "metabase-enterprise/metabot/context";

import { SCOPED_CSS_RESET } from "../private/PublicComponentStylesWrapper";
import { SdkContextProvider } from "../private/SdkContext";
import { SdkFontsGlobalStyles } from "../private/SdkGlobalFontsStyles";
import {
  FullPagePortalContainer,
  PortalContainer,
} from "../private/SdkPortalContainer";
import { SdkUsageProblemDisplay } from "../private/SdkUsageProblem";

/**
 * @expand
 * @category MetabaseProvider
 */
export interface MetabaseProviderProps
  extends Omit<CommonStylingProps, "style"> {
  /**
   * The children of the MetabaseProvider component.
   */
  children: ReactNode;

  /**
   * Defines how to authenticate with Metabase.
   */
  authConfig: MetabaseAuthConfig;

  /**
   * See [Appearance](https://www.metabase.com/docs/latest/embedding/sdk/appearance).
   */
  theme?: MetabaseTheme;

  /**
   * See [Plugins](https://www.metabase.com/docs/latest/embedding/sdk/plugins).
   */
  pluginsConfig?: MetabasePluginsConfig;

  /**
   * See [Global event handlers](https://www.metabase.com/docs/latest/embedding/sdk/config#global-event-handlers).
   */
  eventHandlers?: SdkEventHandlersConfig;

  /**
   * Defines the display language. Accepts an ISO language code such as `en` or `de`.
   * Defaults to the instance locale.
   **/
  locale?: string;

  /**
   * A custom loader component to display while the SDK is loading.
   **/
  loaderComponent?: () => JSX.Element;

  /**
   * A custom error component to display when the SDK encounters an error.
   **/
  errorComponent?: SdkErrorComponent;

  /**
   * Whether to allow logging to the DevTools console. Defaults to true.
   **/
  allowConsoleLog?: boolean;
}

interface InternalMetabaseProviderProps extends MetabaseProviderProps {
  store: Store<SdkStoreState, Action>;
}

export const MetabaseProviderInternal = ({
  children,
  authConfig,
  pluginsConfig,
  eventHandlers,
  theme,
  store,
  className,
  locale,
  errorComponent,
  loaderComponent,
  allowConsoleLog,
}: InternalMetabaseProviderProps): JSX.Element => {
  const { fontFamily } = theme ?? {};
  useInitData({ authConfig, allowConsoleLog });

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

  const instanceLocale = getSetting(store.getState(), "site-locale");

  return (
    <SdkContextProvider>
      <EmotionCacheProvider>
        <Global styles={SCOPED_CSS_RESET} />
        <SdkThemeProvider theme={theme}>
          <SdkFontsGlobalStyles baseUrl={authConfig.metabaseInstanceUrl} />
          <Box className={className} id={EMBEDDING_SDK_ROOT_ELEMENT_ID}>
            <LocaleProvider locale={locale || instanceLocale}>
              {children}
            </LocaleProvider>
            <SdkUsageProblemDisplay
              authConfig={authConfig}
              allowConsoleLog={allowConsoleLog}
            />
            <PortalContainer />
            <FullPagePortalContainer />
          </Box>
        </SdkThemeProvider>
      </EmotionCacheProvider>
    </SdkContextProvider>
  );
};

/**
 * A component that provides the Metabase SDK context and theme.
 *
 * @function
 * @category MetabaseProvider
 */
export const MetabaseProvider = memo(function MetabaseProvider(
  props: MetabaseProviderProps,
) {
  // This makes the store stable across re-renders, but still not a singleton:
  // we need a different store for each test or each storybook story
  const storeRef = useRef<Store<SdkStoreState, Action> | undefined>(undefined);
  if (!storeRef.current) {
    storeRef.current = getSdkStore();
  }

  return (
    <MetabaseReduxProvider store={storeRef.current}>
      <MetabotProvider>
        <MetabaseProviderInternal store={storeRef.current} {...props} />
      </MetabotProvider>
    </MetabaseReduxProvider>
  );
});
