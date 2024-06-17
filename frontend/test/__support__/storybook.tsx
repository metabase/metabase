// Storybook helpers
import { Box } from "@mantine/core";
import { Provider } from "react-redux";

import type { MetabaseTheme } from "embedding-sdk";
import { SdkThemeProvider } from "embedding-sdk/components/private/SdkThemeProvider";
import { mainReducers } from "metabase/reducers-main";
import type { MantineThemeOverride } from "metabase/ui";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { getStore } from "./entities-store";
import { TestWrapper } from "./ui";

export const ReduxProvider = ({
  children,
  storeInitialState = {},
}: {
  children: React.ReactNode;
  storeInitialState?: Record<string, any>;
}) => (
  <Provider store={getStore(mainReducers, storeInitialState)}>
    {children}
  </Provider>
);

export const VisualizationWrapper = ({
  theme,
  children,
}: {
  children: React.ReactElement;
  theme?: MantineThemeOverride;
}) => {
  const store = getStore(mainReducers, { settings: createMockSettingsState() });

  return (
    <Box fs="0.875em">
      <TestWrapper
        store={store}
        withRouter={false}
        withKBar={false}
        theme={theme}
        withDND
      >
        {children}
      </TestWrapper>
    </Box>
  );
};

/**
 * Wrapper to simulate how visualizations are rendered in the SDK.
 *
 * WARNING! The SDK theme provider mutates the global colors object to apply themed colors,
 * which won't be reset even after navigating to other stories.
 */
export const SdkVisualizationWrapper = ({
  children,
  theme,
}: {
  children: React.ReactElement;
  theme?: MetabaseTheme;
}) => (
  <VisualizationWrapper>
    <SdkThemeProvider theme={theme}>{children}</SdkThemeProvider>
  </VisualizationWrapper>
);
