import type * as React from "react";
import { memo, useEffect, useState } from "react";
import { Provider } from "react-redux";

import reducers from "metabase/reducers-main";
import { setOptions } from "metabase/redux/embed";
import { getStore } from "metabase/store";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui/components/theme/ThemeProvider";

import { SdkContentWrapper } from "./components/SdkContentWrapper";
import type { SDKConfigType } from "./config";
import { EmbeddingContext } from "./context";
import { useInitData } from "./hooks";

import "./styles.css";

const MetabaseProviderInternal = ({
  children,
  config,
}: {
  children: React.ReactNode;
  config: SDKConfigType;
}): JSX.Element => {
  const store = getStore(reducers);

  const [font, setFont] = useState<string>(config.font ?? "Lato");

  useEffect(() => {
    if (font) {
      store.dispatch(setOptions({ font }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [font]);

  const { isLoggedIn, isInitialized } = useInitData({
    store,
    config,
  });

  return (
    <EmbeddingContext.Provider
      value={{
        isInitialized,
        isLoggedIn,
        font,
        setFont,
      }}
    >
      <Provider store={store}>
        <EmotionCacheProvider>
          <ThemeProvider>
            <SdkContentWrapper font={font}>
              {!isInitialized ? <div>Initializing...</div> : children}
            </SdkContentWrapper>
          </ThemeProvider>
        </EmotionCacheProvider>
      </Provider>
    </EmbeddingContext.Provider>
  );
};

export const MetabaseProvider = memo(MetabaseProviderInternal);
