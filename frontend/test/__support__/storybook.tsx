// Storybook helpers
// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { StoryFn } from "@storybook/react";
import { useEffect, useMemo } from "react";

import { SdkThemeProvider } from "embedding-sdk-bundle/components/private/SdkThemeProvider";
import { PrintContext } from "metabase/documents/contexts/PrintContext";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { mainReducers } from "metabase/reducers-main";
import { MetabaseReduxProvider } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";
import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type { MantineThemeOverride } from "metabase/ui";
import { Box } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { RawSeries } from "metabase-types/api";

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
  <Box fz="0.875rem" className="mb-wrapper" data-mantine-color-scheme="light">
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
    <Box
      w={1000}
      h={600}
      // @ts-expect-error story file
      bg={theme?.colors?.background}
      className="mb-wrapper"
      data-mantine-color-scheme="light"
    >
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

/**
 * Loki decorator that defers the snapshot until the expected number of
 * visualizations have rendered and painted.
 *
 * Once a card's data query resolves the visualization still needs a tick
 * to mount and ECharts a few more to paint, so a fixed delay races that
 * chain. Instead we poll for the expected number of `visualization-root`
 * nodes, then settle for `settleMs` so charts can finish their entry
 * animation before the screenshot.
 *
 * Polling uses `setTimeout`, not `requestAnimationFrame`: rAF does not
 * fire reliably in Loki's headless Chrome, which would strand the async
 * callback and hang the run. For the same reason the callback is fired
 * exactly once and is also flushed on unmount — a never-resolved Loki
 * async callback crashes the whole test run, not just one story.
 *
 * `timeoutMs` is a hard cap: the callback always resolves, so a story
 * that never renders its chart fails loudly with a screenshot instead
 * of hanging.
 */
export function createWaitForChartsDecorator({
  count,
  settleMs = 1000,
  timeoutMs = 20000,
}: {
  count: number;
  settleMs?: number;
  timeoutMs?: number;
}) {
  return function WaitForChartsDecorator(Story: StoryFn) {
    const asyncCallback = useMemo(() => createAsyncCallback(), []);

    useEffect(() => {
      const startedAt = Date.now();
      let pollTimer: ReturnType<typeof setTimeout> | undefined;
      let settleTimer: ReturnType<typeof setTimeout> | undefined;
      let resolved = false;

      const resolve = () => {
        if (resolved) {
          return;
        }
        resolved = true;
        asyncCallback();
      };

      const poll = () => {
        const renderedCount = document.querySelectorAll(
          '[data-testid="visualization-root"]',
        ).length;
        const timedOut = Date.now() - startedAt > timeoutMs;

        if (renderedCount >= count || timedOut) {
          settleTimer = setTimeout(resolve, settleMs);
          return;
        }
        pollTimer = setTimeout(poll, 100);
      };
      poll();

      return () => {
        clearTimeout(pollTimer);
        clearTimeout(settleTimer);
        // Never leave the Loki async callback unresolved, even if the
        // story unmounts mid-wait — an orphaned callback hangs the run.
        resolve();
      };
    }, [asyncCallback]);

    return <Story />;
  };
}

/**
 * Loki decorator that forces document card embeds to render eagerly.
 *
 * Card embeds defer their visualization until an IntersectionObserver
 * reports them on-screen (see `useNodeInViewport`). IO callbacks are only
 * delivered on rendered frames, and Loki's headless Chrome produces none
 * on an idle page — so a card would stay a skeleton forever. Providing
 * `isPrinting: true` makes `isInViewport` true unconditionally, rendering
 * the card immediately without the observer. The `@media print` rules
 * that hide `[data-hide-on-print]` are keyed on the print media query,
 * not this flag, so the snapshot is unaffected.
 */
export function ForceDocumentCardRenderDecorator(Story: StoryFn) {
  return (
    <PrintContext.Provider
      value={{ isPrinting: true, prepareForPrint: async () => {} }}
    >
      <Story />
    </PrintContext.Provider>
  );
}
