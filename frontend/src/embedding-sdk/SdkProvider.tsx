import type * as React from "react";
import { memo, useEffect, useState } from "react";
import { Provider } from "react-redux";
import styled from "@emotion/styled";
import type { MantineThemeOverride } from "@mantine/core";
import { ThemeProvider } from "metabase/ui/components/theme/ThemeProvider";
import { getStore } from "metabase/store";
import reducers from "metabase/reducers-main";
import { getAceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";
import { setOptions } from "metabase/redux/embed";
import { color, alpha } from "metabase/ui/utils/colors";

import { SdkEmotionCacheProvider } from "./SdkEmotionCacheProvider";
import { EmbeddingContext } from "./context";
import type { SDKConfigType } from "./config";
import { SDK_CONTEXT_CLASS_NAME } from "./config";

import "./styles.css";
import { useInitData } from "./hooks";

const MetabaseProviderInternal = ({
  children,
  config,
  theme,
}: {
  children: React.ReactNode;
  config: SDKConfigType;
  theme: MantineThemeOverride;
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
        <SdkEmotionCacheProvider>
          <ThemeProvider theme={theme}>
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

  ${({ theme }) => getAceEditorStyles(theme)}
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
