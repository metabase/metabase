import type * as React from "react";
import { Provider } from "react-redux";
import { ThemeProvider } from "metabase/ui";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { getStore } from "metabase/store";
import reducers from "metabase/reducers-public";

import { EmbeddingContext } from "./context";

export const MetabaseProvider = ({
  children,
  apiUrl,
  secretKey,
}: {
  children: React.ReactNode;
  apiUrl: string;
  secretKey: string;
}): JSX.Element => {
  const store = getStore(reducers);

  return (
    <EmbeddingContext.Provider
      value={{
        apiUrl,
        secretKey,
      }}
    >
      <Provider store={store}>
        <EmotionCacheProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </EmotionCacheProvider>
      </Provider>
    </EmbeddingContext.Provider>
  );
};
