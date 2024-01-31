import type * as React from "react";
import { Provider } from "react-redux";
import { useEffect } from "react";
import { ThemeProvider } from "metabase/ui/components/theme/ThemeProvider";
import { getStore } from "metabase/store";
import reducers from "metabase/reducers-main";
import registerVisualizations from "metabase/visualizations/register";
import GlobalStyles from "metabase/styled-components/containers/GlobalStyles";
import { setOptions } from "metabase/redux/embed";
import { SdkEmotionCacheProvider } from "./SdkEmotionCacheProvider";

import { EmbeddingContext } from "./context";
import { SDK_CONTEXT_CLASS_NAME } from "./config";
import "./styles.css";

export const MetabaseProvider = ({
  children,
  apiUrl,
  apiKey,
  font = "Lato",
}: {
  children: React.ReactNode;
  apiUrl: string;
  apiKey: string;
  font: string;
}): JSX.Element => {
  const store = getStore(reducers);

  useEffect(() => {
    store.dispatch(setOptions({ font }));
  }, [store, font]);

  useEffect(() => {
    registerVisualizations();
  }, []);

  return (
    <EmbeddingContext.Provider
      value={{
        apiUrl,
        apiKey,
      }}
    >
      <Provider store={store}>
        <SdkEmotionCacheProvider>
          <ThemeProvider>
            <GlobalStyles />
            <div id={SDK_CONTEXT_CLASS_NAME}>{children}</div>
          </ThemeProvider>
        </SdkEmotionCacheProvider>
      </Provider>
    </EmbeddingContext.Provider>
  );
};
