import type { AnyAction, Store } from "@reduxjs/toolkit";
import type * as React from "react";
import { memo } from "react";
import { Provider } from "react-redux";

import reducers from "metabase/reducers-main";
import { getStore } from "metabase/store";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui/components/theme/ThemeProvider";
import type { State } from "metabase-types/store";

import type { SDKConfigType } from "../../types";
import { AppInitializeController } from "../private/AppInitializeController";

import "metabase/css/vendor.css";
import "metabase/css/index.module.css";

const store = getStore(reducers) as unknown as Store<State, AnyAction>;

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
        <AppInitializeController config={config}>
          {children}
        </AppInitializeController>
      </ThemeProvider>
    </EmotionCacheProvider>
  </Provider>
);

export const MetabaseProvider = memo(MetabaseProviderInternal);
