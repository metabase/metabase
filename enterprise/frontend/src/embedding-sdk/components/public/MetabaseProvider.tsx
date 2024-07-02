import type { Action, Store } from "@reduxjs/toolkit";
import { type ReactNode, type JSX, useEffect } from "react";
import { memo } from "react";
import { Provider } from "react-redux";

import { AppInitializeController } from "embedding-sdk/components/private/AppInitializeController";
import { SdkThemeProvider } from "embedding-sdk/components/private/SdkThemeProvider";
import { DEFAULT_FONT } from "embedding-sdk/config";
import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import { store } from "embedding-sdk/store";
import {
  setErrorComponent,
  setLoaderComponent,
  setMetabaseClientUrl,
  setPlugins,
} from "embedding-sdk/store/reducer";
import type { SdkStoreState } from "embedding-sdk/store/types";
import type { SDKConfig } from "embedding-sdk/types";
import type { MetabaseTheme } from "embedding-sdk/types/theme";
import { setOptions } from "metabase/redux/embed";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";

import "metabase/css/vendor.css";
import "metabase/css/index.module.css";

export interface MetabaseProviderProps {
  children: ReactNode;
  config: SDKConfig;
  pluginsConfig?: SdkPluginsConfig;
  theme?: MetabaseTheme;
}

interface InternalMetabaseProviderProps extends MetabaseProviderProps {
  store: Store<SdkStoreState, Action>;
}

export const MetabaseProviderInternal = ({
  children,
  config,
  pluginsConfig,
  theme,
  store,
}: InternalMetabaseProviderProps): JSX.Element => {
  const { fontFamily = DEFAULT_FONT } = theme ?? {};

  useEffect(() => {
    if (fontFamily) {
      store.dispatch(setOptions({ font: fontFamily }));
    }
  }, [store, fontFamily]);

  useEffect(() => {
    store.dispatch(setPlugins(pluginsConfig || null));
  }, [store, pluginsConfig]);

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
    <Provider store={store}>
      <EmotionCacheProvider>
        <SdkThemeProvider theme={theme}>
          <AppInitializeController config={config}>
            {children}
          </AppInitializeController>
        </SdkThemeProvider>
      </EmotionCacheProvider>
    </Provider>
  );
};

export const MetabaseProvider = memo(function MetabaseProvider(
  props: MetabaseProviderProps,
) {
  return <MetabaseProviderInternal store={store} {...props} />;
});
