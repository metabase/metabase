import type { Location } from "history";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { BreakoutLegend } from "metabase/metrics-viewer/components/BreakoutLegend/BreakoutLegend";
import { DimensionPickerSidebar } from "metabase/metrics-viewer/components/DimensionPickerSidebar";
import {
  MetricsViewerEmptyState,
  MetricsViewerNoDimensionBreakoutEmptyState,
} from "metabase/metrics-viewer/components/EmptyState";
import { MetricSearchPanel } from "metabase/metrics-viewer/components/MetricSearchPanel";
import { MetricsViewerDimensionBreakoutContent } from "metabase/metrics-viewer/components/MetricsViewerDimensionBreakoutContent";
import {
  MetricsViewerProvider,
  useMetricsViewerContext,
} from "metabase/metrics-viewer/context";
import { useViewerState } from "metabase/metrics-viewer/hooks";
import { Box, Center, Flex, Stack } from "metabase/ui";

import S from "./MetricsViewerPage.module.css";

export type MetricsViewerPageProps = {
  location: Location;
};

export function MetricsViewerPage(props: MetricsViewerPageProps) {
  const viewerState = useViewerState(props);

  if (!viewerState.initialLoadComplete) {
    // parsing formulas won't work until the initial set of definitions are loaded
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading />
      </Center>
    );
  }

  return (
    <MetricsViewerProvider value={viewerState}>
      <MetricsViewerPageBody />
    </MetricsViewerProvider>
  );
}

function MetricsViewerPageBody() {
  const { definitions, activeDimensionBreakout, isSidebarOpen } =
    useMetricsViewerContext();

  const hasDefinitions = Object.keys(definitions).length > 0;
  const hasLoadedDefinitions = Object.values(definitions).some(
    (entry) => entry.definition != null,
  );
  const showDimensionPickerSidebar = isSidebarOpen && activeDimensionBreakout;
  const showBreakoutLegend =
    !showDimensionPickerSidebar && activeDimensionBreakout?.type !== "scalar";

  return (
    <Stack px="3rem" h="100%" gap={0} className={S.root}>
      <Box pt="md" flex="0 0 auto">
        <MetricSearchPanel />
      </Box>
      <Flex flex="1 1 auto" mih={0}>
        <Stack gap={0} flex={1} mih={0} miw={0}>
          <Flex flex="1 1 auto" mih={0} pt="lg">
            <Flex
              direction="column"
              pt="md"
              pb="lg"
              flex={1}
              miw={0}
              className={S.content}
            >
              {!hasDefinitions ? (
                <MetricsViewerEmptyState />
              ) : activeDimensionBreakout ? (
                <MetricsViewerDimensionBreakoutContent />
              ) : hasLoadedDefinitions ? (
                <MetricsViewerNoDimensionBreakoutEmptyState />
              ) : null}
            </Flex>
            {showBreakoutLegend && <BreakoutLegend />}
            {showDimensionPickerSidebar && (
              <DimensionPickerSidebar
                activeDimensionBreakout={activeDimensionBreakout}
              />
            )}
          </Flex>
        </Stack>
      </Flex>
    </Stack>
  );
}
