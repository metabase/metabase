import { type ReactNode, type JSX, useEffect, useMemo } from "react";
import { memo } from "react";
import { Provider } from "react-redux";

import { AppInitializeController } from "embedding-sdk/components/private/AppInitializeController";
import {} from "embedding-sdk/components/private/PublicComponentWrapper";
import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import { getEmbeddingThemeOverride } from "embedding-sdk/lib/theme/get-embedding-theme";
import { store } from "embedding-sdk/store";
import {
  setErrorComponent,
  setLoaderComponent,
  setPlugins,
} from "embedding-sdk/store/reducer";
import type { SDKConfig } from "embedding-sdk/types";
import type { MetabaseColors, MetabaseTheme } from "embedding-sdk/types/theme";
import { colors } from "metabase/lib/colors";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui/components/theme/ThemeProvider";

import "metabase/css/vendor.css";
import "metabase/css/index.module.css";

const originalColors = { ...colors };

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
  const themeOverride = useMemo(() => {
    if (theme?.colors) {
      Object.entries(theme.colors).forEach(([key, value]) => {
        colors[key as keyof MetabaseColors] = value;
      });
    } else {
      Object.entries(originalColors).forEach(([key, value]) => {
        colors[key as keyof MetabaseColors] = value;
      });
    }

    return theme && getEmbeddingThemeOverride(theme);
  }, [theme]);

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
        <ThemeProvider theme={themeOverride}>
          <AppInitializeController config={config}>
            {children}
          </AppInitializeController>
        </ThemeProvider>
      </EmotionCacheProvider>
    </Provider>
  );
};

export const MetabaseProvider = memo(MetabaseProviderInternal);
