import { type ReactNode, type JSX, useEffect } from "react";
import { memo } from "react";
import { Provider } from "react-redux";

import { AppInitializeController } from "embedding-sdk/components/private/AppInitializeController";
import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import { store } from "embedding-sdk/store";
import {
  setErrorComponent,
  setLoaderComponent,
  setPlugins,
} from "embedding-sdk/store/reducer";
import type { SDKConfig } from "embedding-sdk/types";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui/components/theme/ThemeProvider";

import "metabase/css/vendor.css";
import "metabase/css/index.module.css";

interface MetabaseProviderProps {
  children: ReactNode;
  config: SDKConfig;
  pluginsConfig?: SdkPluginsConfig;
}

const MetabaseProviderInternal = ({
  children,
  config,
  pluginsConfig,
}: MetabaseProviderProps): JSX.Element => {
  useEffect(() => {
    store.dispatch(setPlugins(pluginsConfig || null));
  }, [pluginsConfig]);

  store.dispatch(setLoaderComponent(config.loaderComponent));
  store.dispatch(setErrorComponent(config.errorComponent));

  return (
    <Provider store={store}>
      <EmotionCacheProvider>
        <ThemeProvider>
          <AppInitializeController config={config}>
            {children}
          </AppInitializeController>
        </ThemeProvider>
      </EmotionCacheProvider>
    </Provider>
  );
};

export const MetabaseProvider = memo(MetabaseProviderInternal);
