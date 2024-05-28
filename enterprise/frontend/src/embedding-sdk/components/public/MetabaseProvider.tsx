import { type ReactNode, type JSX, useEffect, useMemo } from "react";
import { memo } from "react";
import { Provider } from "react-redux";

import { AppInitializeController } from "embedding-sdk/components/private/AppInitializeController";
import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import {
  getEmbeddingThemeOverride,
  getThemedColorsPalette,
} from "embedding-sdk/lib/theme/get-embedding-theme";
import { store } from "embedding-sdk/store";
import {
  setErrorComponent,
  setLoaderComponent,
  setPlugins,
} from "embedding-sdk/store/reducer";
import type { SDKConfig } from "embedding-sdk/types";
import type { MetabaseTheme } from "embedding-sdk/types/theme";
import { colors } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";
import { setOptions } from "metabase/redux/embed";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui/components/theme/ThemeProvider";

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
  const themeOverride = useMemo(() => {
    const combinedThemeColors = getThemedColorsPalette(theme?.colors);

    Object.entries(combinedThemeColors).forEach(([key, value]) => {
      colors[key as ColorName] = value;
    });

    return theme && getEmbeddingThemeOverride(theme);
  }, [theme]);

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
