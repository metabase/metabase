import type * as React from "react";
import { Provider } from "react-redux";
import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { ThemeProvider } from "metabase/ui/components/theme/ThemeProvider";
import { getStore } from "metabase/store";
import reducers from "metabase/reducers-main";
import registerVisualizations from "metabase/visualizations/register";
import { alpha, color } from "metabase/lib/colors";
import { aceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";
import api from "metabase/lib/api";
import { setOptions } from "metabase/redux/embed";
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
  font = "Lato",
}: {
  children: React.ReactNode;
  apiUrl: string;
  apiKey: string;
  font?: string;
}): JSX.Element => {
  const store = getStore(reducers);

  api.basename = apiUrl;
  api.apiKey = apiKey;

  const [isInitialized, setInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    Promise.all([
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      store.dispatch(refreshCurrentUser()),
      store.dispatch(reloadSettings()),
    ]).then(() => {
      registerVisualizations();

      setInitialized(true);
      setIsLoggedIn(true);
    });
    // Disabling this for now since we change the store with this call, which keeps calling the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (font) {
      store.dispatch(setOptions({ font }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [font]);

  useEffect(() => {
    if (!apiKey) {
      setIsLoggedIn(false);
    } else {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      store.dispatch(refreshCurrentUser()).then(() => {
        setIsLoggedIn(true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  return (
    <EmbeddingContext.Provider
      value={{
        apiUrl,
        apiKey,
        isInitialized,
        isLoggedIn,
      }}
    >
      <Provider store={store}>
        <SdkEmotionCacheProvider>
          <ThemeProvider>
            <ContentWrapper id={SDK_CONTEXT_CLASS_NAME} font={font}>
              {!isInitialized ? <div>Initializing...</div> : children}
            </ContentWrapper>
          </ThemeProvider>
        </SdkEmotionCacheProvider>
      </Provider>
    </EmbeddingContext.Provider>
  );
};

const ContentWrapper = styled.div<{ font: string }>`
  --default-font-family: "${({ font }) => font}";
  --color-brand: ${color("brand")};
  --color-brand-alpha-04: ${alpha("brand", 0.04)};
  --color-brand-alpha-88: ${alpha("brand", 0.88)};
  --color-focus: ${color("focus")};

  ${aceEditorStyles}
  ${saveDomImageStyles}

  --default-font-size: 0.875em;
  --default-font-color: var(--color-text-dark);
  --default-bg-color: var(--color-bg-light);

  font-family: var(--default-font-family), sans-serif;
  font-size: var(--default-font-size);
  font-weight: 400;
  font-style: normal;
  color: var(--color-text-dark);
  margin: 0;
  height: 100%; /* ensure the entire page will fill the window */
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-light);

  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
`;
