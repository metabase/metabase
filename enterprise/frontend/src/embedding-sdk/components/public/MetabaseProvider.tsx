import { type JSX, memo, type ReactNode, useEffect } from "react";
import { Provider } from "react-redux";
import { Route, Router } from "react-router";

import { AppInitializeController } from "embedding-sdk/components/private/AppInitializeController";
import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import { history, store } from "embedding-sdk/store";
import { setPlugins } from "embedding-sdk/store/reducer";
import type { SDKConfigType } from "embedding-sdk/types";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui/components/theme/ThemeProvider";

import "metabase/css/vendor.css";
import "metabase/css/index.module.css";

interface MetabaseProviderProps {
  children: ReactNode;
  config: SDKConfigType;
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

  return (
    <Provider store={store}>
      <EmotionCacheProvider>
        <ThemeProvider>
          <AppInitializeController config={config}>
            <Router history={history}>
              <Route path="/" component={() => <>{children}</>} />
            </Router>
          </AppInitializeController>
        </ThemeProvider>
      </EmotionCacheProvider>
    </Provider>
  );
};

export const MetabaseProvider = memo(MetabaseProviderInternal);
