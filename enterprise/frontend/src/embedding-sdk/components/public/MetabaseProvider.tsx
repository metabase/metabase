import { Global } from "@emotion/react";
import type { Action, Store } from "@reduxjs/toolkit";
import { type JSX, type ReactNode, memo, useEffect } from "react";
import { Provider } from "react-redux";

import { SdkThemeProvider } from "embedding-sdk/components/private/SdkThemeProvider";
import { EMBEDDING_SDK_ROOT_ELEMENT_ID } from "embedding-sdk/config";
import { useInitData } from "embedding-sdk/hooks";
import type { SdkEventHandlersConfig } from "embedding-sdk/lib/events";
import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import { getSdkStore } from "embedding-sdk/store";
import {
  setErrorComponent,
  setEventHandlers,
  setLoaderComponent,
  setMetabaseClientUrl,
  setPlugins,
} from "embedding-sdk/store/reducer";
import type { SdkStoreState } from "embedding-sdk/store/types";
import type { SDKConfig } from "embedding-sdk/types";
import type { MetabaseTheme } from "embedding-sdk/types/theme";
import { LocaleProvider } from "metabase/public/LocaleProvider";
import { setOptions } from "metabase/redux/embed";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";

import { SCOPED_CSS_RESET } from "../private/PublicComponentStylesWrapper";
import { SdkFontsGlobalStyles } from "../private/SdkGlobalFontsStyles";
import {
  FullPagePortalContainer,
  PortalContainer,
} from "../private/SdkPortalContainer";
import { SdkUsageProblemDisplay } from "../private/SdkUsageProblem";

import "metabase/css/index.module.css";
import "metabase/css/vendor.css";

export interface MetabaseProviderProps {
  children: ReactNode;
  config: SDKConfig;
  pluginsConfig?: SdkPluginsConfig;
  eventHandlers?: SdkEventHandlersConfig;
  theme?: MetabaseTheme;
  className?: string;
  locale?: string;
}

interface InternalMetabaseProviderProps extends MetabaseProviderProps {
  store: Store<SdkStoreState, Action>;
}

export const MetabaseProviderInternal = ({
  children,
  config,
  pluginsConfig,
  eventHandlers,
  theme,
  store,
  className,
  locale,
}: InternalMetabaseProviderProps): JSX.Element => {
  const { fontFamily } = theme ?? {};
  useInitData({ config });

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
    store.dispatch(setLoaderComponent(config.loaderComponent ?? null));
  }, [store, config.loaderComponent]);

  useEffect(() => {
    store.dispatch(setErrorComponent(config.errorComponent ?? null));
  }, [store, config.errorComponent]);

  useEffect(() => {
    store.dispatch(setMetabaseClientUrl(config.metabaseInstanceUrl));
  }, [store, config.metabaseInstanceUrl]);

  return (
    <EmotionCacheProvider>
      <Global styles={SCOPED_CSS_RESET} />
      <SdkThemeProvider theme={theme}>
        <SdkFontsGlobalStyles baseUrl={config.metabaseInstanceUrl} />
        <div className={className} id={EMBEDDING_SDK_ROOT_ELEMENT_ID}>
          <LocaleProvider locale={locale}>{children}</LocaleProvider>
          <SdkUsageProblemDisplay config={config} />
          <PortalContainer />
          <FullPagePortalContainer />
        </div>
      </SdkThemeProvider>
    </EmotionCacheProvider>
  );
};

export const MetabaseProvider = memo(function MetabaseProvider({
  // @ts-expect-error -- we don't want to expose the store prop
  // eslint-disable-next-line react/prop-types
  store = getSdkStore(),
  ...props
}: MetabaseProviderProps) {
  return (
    <Provider store={store}>
      <MetabaseProviderInternal store={store} {...props} />
    </Provider>
  );
});
