import styled from "@emotion/styled";
import type * as React from "react";
import { memo, useEffect, useState } from "react";
import { Provider } from "react-redux";
import { alpha, color } from "metabase/lib/colors";
import { aceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import reducers from "metabase/reducers-main";
import { setOptions } from "metabase/redux/embed";
import { getStore } from "metabase/store";
import { ThemeProvider } from "metabase/ui/components/theme/ThemeProvider";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";

import type { SDKConfigType } from "./config";
import { SDK_CONTEXT_CLASS_NAME } from "./config";
import { EmbeddingContext } from "./context";
import { SdkEmotionCacheProvider } from "./SdkEmotionCacheProvider";

import type { SDKPlugin } from "./plugins";
import { COMPUTED_SDK_PLUGINS, mergePlugins } from "./plugins";

import { useInitData } from "./hooks";
import "./styles.css";

const MetabaseProviderInternal = ({
  children,
  config,
  plugins,
}: {
  children: React.ReactNode;
  config: SDKConfigType;
  plugins: SDKPlugin[];
}): JSX.Element => {
  const store = getStore(reducers);

  useEffect(() => {
    if (window.location.hostname === "localhost") {
      (window as any).metaReduxStore = store;
    }
  }, [store]);

  const [font, setFont] = useState<string>(config.font ?? "Lato");

  useEffect(() => {
    // this should probably be saved in a context, not in a global variable
    COMPUTED_SDK_PLUGINS.current = mergePlugins(plugins);
  }, [plugins]);

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

export const MetabaseProvider = memo(MetabaseProviderInternal);

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
