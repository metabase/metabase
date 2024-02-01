import type * as React from "react";
import { Provider } from "react-redux";
import { useEffect, useState } from "react";
import { ThemeProvider } from "metabase/ui/components/theme/ThemeProvider";
import { getStore } from "metabase/store";
import reducers from "metabase/reducers-main";
import registerVisualizations from "metabase/visualizations/register";
import GlobalStyles from "metabase/styled-components/containers/GlobalStyles";
import { setOptions } from "metabase/redux/embed";
import api from "metabase/lib/api";
import { reloadSettings } from "metabase/admin/settings/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import { SdkEmotionCacheProvider } from "./SdkEmotionCacheProvider";
import { EmbeddingContext } from "./context";
import { SDK_CONTEXT_CLASS_NAME } from "./config";
import "./styles.css";

export const MetabaseProvider = ({
  children,
  apiUrl,
  apiKey,
  font,
}: {
  children: React.ReactNode;
  apiUrl: string;
  apiKey: string;
  font?: string;
}): JSX.Element => {
  const store = getStore(reducers);

  api.basename = apiUrl;
  api.apiKey = apiKey;

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (font) {
      store.dispatch(setOptions({ font }));
    }
  }, [store, font]);

  useEffect(() => {
    registerVisualizations();

    Promise.all([
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      store.dispatch(refreshCurrentUser()),
      store.dispatch(reloadSettings()),
    ]).then(() => {
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            {loading ? (
              <div>Loading...</div>
            ) : (
              <div id={SDK_CONTEXT_CLASS_NAME}>{children}</div>
            )}
          </ThemeProvider>
        </SdkEmotionCacheProvider>
      </Provider>
    </EmbeddingContext.Provider>
  );
};
