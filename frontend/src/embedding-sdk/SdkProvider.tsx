import type * as React from "react";
import { Provider } from "react-redux";
import { useEffect } from "react";
import { ThemeProvider } from "metabase/ui/components/theme/ThemeProvider";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { getStore } from "metabase/store";
import reducers from "metabase/reducers-main";
import registerVisualizations from "metabase/visualizations/register";
import GlobalStyles from "metabase/styled-components/containers/GlobalStyles/GlobalStyles";

import { EmbeddingContext } from "./context";
import "./styles.css";

export const MetabaseProvider = ({
  children,
  apiUrl,
  apiKey,
}: {
  children: React.ReactNode;
  apiUrl: string;
  apiKey: string;
}): JSX.Element => {
  const store = getStore(reducers);

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
        <EmotionCacheProvider>
          <ThemeProvider>
            <GlobalStyles />
            {children}
          </ThemeProvider>
        </EmotionCacheProvider>
      </Provider>
    </EmbeddingContext.Provider>
  );
};
