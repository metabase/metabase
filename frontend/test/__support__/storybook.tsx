// Storybook helpers
// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { StoryFn } from "@storybook/react";
import { useEffect, useMemo } from "react";

import { SdkThemeProvider } from "embedding-sdk-bundle/components/private/SdkThemeProvider";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { mainReducers } from "metabase/reducers-main";
import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type { MantineThemeOverride } from "metabase/ui";
import { Box } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { RawSeries } from "metabase-types/api";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

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
  displayTheme,
  children,
  initialStore = createMockState(),
}: {
  children: React.ReactElement;
  theme?: MantineThemeOverride;
  displayTheme?: "light" | "dark";
  initialStore?: State;
}) => {
  const store = getStore(mainReducers, initialStore);

  return (
    <TestWrapper
      store={store}
      withRouter={false}
      withKBar={false}
      theme={theme}
      displayTheme={displayTheme}
      withDND
      withCssVariables
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
  initialStore,
}: {
  children: React.ReactElement;
  theme?: MetabaseTheme;
  initialStore?: State;
}) => (
  <Box fz="0.875rem">
    <VisualizationWrapper initialStore={initialStore}>
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

/**
 * Shows how a visualization is rendered in the SDK,
 * using the SDK's theme provider.
 */
export const SdkVisualizationStory = ({
  rawSeries,
  theme,
}: IsomorphicVisualizationStoryProps & { theme?: MetabaseTheme }) => {
  return (
    // @ts-expect-error story file
    <Box w={1000} h={600} bg={theme?.colors?.background}>
      <VisualizationWrapper>
        <SdkThemeProvider theme={theme}>
          <Visualization rawSeries={rawSeries} width={500} />
        </SdkThemeProvider>
      </VisualizationWrapper>
    </Box>
  );
};

export function createWaitForResizeToStopDecorator(timeoutMs: number = 1000) {
  return function WaitForResizeToStopDecorator(Story: StoryFn) {
    const asyncCallback = useMemo(() => createAsyncCallback(), []);

    useEffect(() => {
      const timeoutId = setTimeout(asyncCallback, timeoutMs);

      return () => {
        clearTimeout(timeoutId);
      };
    }, [asyncCallback]);

    return <Story />;
  };
}
