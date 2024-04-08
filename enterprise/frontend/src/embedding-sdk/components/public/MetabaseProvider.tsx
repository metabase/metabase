import type * as React from "react";
import { memo } from "react";
import { Provider } from "react-redux";

import { AppInitializeController } from "embedding-sdk/components/private/AppInitializeController";
import type {SDKConfigType} from "embedding-sdk/types";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui/components/theme/ThemeProvider";

import "metabase/css/vendor.css";
import "metabase/css/index.module.css";

const MetabaseProviderInternal = ({
  children,
  config,
}: {
  children: React.ReactNode;
  config: SDKConfigType;
}): React.JSX.Element => (
  <Provider store={store}>
    <EmotionCacheProvider>
      <ThemeProvider>
        <AppInitializeController store={store} config={config}>
          {children}
        </AppInitializeController>
      </ThemeProvider>
    </EmotionCacheProvider>
  </Provider>
);

export const MetabaseProvider = memo(MetabaseProviderInternal);
