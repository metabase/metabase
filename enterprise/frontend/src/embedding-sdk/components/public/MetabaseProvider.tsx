import type { ReactNode } from "react";
import { memo } from "react";
import { Provider } from "react-redux";

import { AppInitializeController } from "embedding-sdk/components/private/AppInitializeController";
import { store } from "embedding-sdk/store";
import type { SDKConfigType } from "embedding-sdk/types";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui/components/theme/ThemeProvider";

import "metabase/css/vendor.css";
import "metabase/css/index.module.css";

const MetabaseProviderInternal = ({
  children,
  config,
}: {
  children: ReactNode;
  config: SDKConfigType;
}): JSX.Element => (
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

export const MetabaseProvider = memo(MetabaseProviderInternal);
