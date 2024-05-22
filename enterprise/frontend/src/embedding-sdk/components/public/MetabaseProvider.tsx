import { type ReactNode, type JSX, useEffect } from "react";
import { memo } from "react";
import { Provider } from "react-redux";

import { AppInitializeController } from "embedding-sdk/components/private/AppInitializeController";
import { SdkThemeProvider } from "embedding-sdk/components/private/SdkThemeProvider";
import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import { store } from "embedding-sdk/store";
import {
  setErrorComponent,
  setLoaderComponent,
  setPlugins,
} from "embedding-sdk/store/reducer";
import type { SDKConfig } from "embedding-sdk/types";
import type { MetabaseTheme } from "embedding-sdk/types/theme";
import { setOptions } from "metabase/redux/embed";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";

import "metabase/css/vendor.css";
import "metabase/css/index.module.css";

interface MetabaseProviderProps {
  children: ReactNode;
  config: SDKConfig;
  pluginsConfig?: SdkPluginsConfig;
  theme?: MetabaseTheme;
}

const MetabaseProviderInternal = ({
  children,
  config,
  pluginsConfig,
  theme,
}: MetabaseProviderProps): JSX.Element => {
  useEffect(() => {
    if (theme?.fontFamily) {
      store.dispatch(
        setOptions({
          font: theme.fontFamily,
        }),
      );
    }
  }, [theme?.fontFamily]);

  useEffect(() => {
    store.dispatch(setPlugins(pluginsConfig || null));
  }, [pluginsConfig]);

  useEffect(() => {
    store.dispatch(setLoaderComponent(config.loaderComponent ?? null));
  }, [config.loaderComponent]);

  useEffect(() => {
    store.dispatch(setErrorComponent(config.errorComponent ?? null));
  }, [config.errorComponent]);

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

export const MetabaseProvider = memo(MetabaseProviderInternal);
