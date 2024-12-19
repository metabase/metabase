// Storybook helpers

import type { MetabaseTheme } from "embedding-sdk";
import { SdkThemeProvider } from "embedding-sdk/components/private/SdkThemeProvider";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { mainReducers } from "metabase/reducers-main";
import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type { MantineThemeOverride } from "metabase/ui";
import { Box } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { RawSeries } from "metabase-types/api";
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
  <MetabaseReduxProvider store={getStore(mainReducers, storeInitialState)}>
    {children}
  </MetabaseReduxProvider>
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
    <TestWrapper
      store={store}
      withRouter={false}
      withKBar={false}
      theme={theme}
      withDND
    >
      {children}
    </TestWrapper>
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
  <Box fz="0.875rem">
    <VisualizationWrapper>
      <SdkThemeProvider theme={theme}>{children}</SdkThemeProvider>
    </VisualizationWrapper>
  </Box>
);
export interface IsomorphicVisualizationStoryProps {
  // Use `any` on purpose to avoid type casting of imported json snapshots of raw series
  rawSeries: RawSeries | any;
}

export const IsomorphicVisualizationStory = ({
  rawSeries,
}: IsomorphicVisualizationStoryProps) => {
  return (
    <Box display="inline-block">
      <Box style={{ border: "1px solid black" }} display="inline-block">
        <StaticVisualization
          isStorybook
          rawSeries={rawSeries}
          renderingContext={createStaticRenderingContext()}
        />
      </Box>
      <Box w={1000} h={600} style={{ border: "1px solid black" }} mt={4}>
        <VisualizationWrapper>
          <Visualization rawSeries={rawSeries} width={500} />
        </VisualizationWrapper>
      </Box>
    </Box>
  );
};
