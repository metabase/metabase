import type { Action, Store } from "@reduxjs/toolkit";
import type { JSX, ReactNode } from "react";
import { memo, useEffect } from "react";
import { Provider } from "react-redux";

import { AppInitializeController } from "embedding-sdk/components/private/AppInitializeController";
import { SdkThemeProvider } from "embedding-sdk/components/private/SdkThemeProvider";
import { DEFAULT_FONT } from "embedding-sdk/config";
import type { SdkEventHandlersConfig } from "embedding-sdk/lib/events";
import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import { store } from "embedding-sdk/store";
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
import { useSelector } from "metabase/lib/redux";
import { setOptions } from "metabase/redux/embed";
import { getSetting } from "metabase/selectors/settings";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { activateEEPlugins } from "metabase-enterprise/plugins";

import "metabase/css/index.module.css";
import "metabase/css/vendor.css";

export interface MetabaseProviderProps {
  children: ReactNode;
  config: SDKConfig;
  pluginsConfig?: SdkPluginsConfig;
  eventHandlers?: SdkEventHandlersConfig;
  theme?: MetabaseTheme;
  className?: string;
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
    <Provider store={store}>
      <PluginsActivator />
      <EmotionCacheProvider>
        <SdkThemeProvider theme={theme}>
          <AppInitializeController className={className} config={config}>
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

const PluginsActivator = () => {
  // it needs to be nested in the provider to be able to use useSelector
  // we can't just use useSelector in the MetabaseProvider because it would be outside of  redux's <Provider>

  const tokenFeatures = useSelector(state =>
    getSetting(state, "token-features"),
  );

  useEffect(() => {
    if (
      tokenFeatures &&
      Object.values(tokenFeatures).some(value => value === true)
    ) {
      activateEEPlugins();
    }
  }, [tokenFeatures]);

  return null;
};
