import { BreakoutLegend } from "metabase/metrics-viewer/components/BreakoutLegend/BreakoutLegend";
import { DimensionPickerSidebar } from "metabase/metrics-viewer/components/DimensionPickerSidebar";
import {
  MetricsViewerEmptyState,
  MetricsViewerNoDimensionBreakoutEmptyState,
} from "metabase/metrics-viewer/components/EmptyState";
import { MetricSearchPanel } from "metabase/metrics-viewer/components/MetricSearchPanel";
import { MetricsViewerDimensionBreakoutContent } from "metabase/metrics-viewer/components/MetricsViewerDimensionBreakoutContent";
import { useMetricsViewerContext } from "metabase/metrics-viewer/context";
import { Box, Flex, Stack } from "metabase/ui";

import S from "./MetricsViewerBody.module.css";

type MetricsViewerBodyProps = {
  /** Embedded in another page: no "Explore" heading or Filter button, and tighter padding. */
  isEmbedded?: boolean;
};

/** The metric search bar and the chart for the current breakout. Must render inside a `MetricsViewerProvider`. */
export function MetricsViewerBody({
  isEmbedded = false,
}: MetricsViewerBodyProps) {
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
    <Stack px={isEmbedded ? "lg" : "3rem"} h="100%" gap={0} className={S.root}>
      <Box pt="lg" flex="0 0 auto">
        <MetricSearchPanel showHeading={!isEmbedded} />
      </Box>
      <Flex flex="1 1 auto" mih={0}>
        <Stack gap={0} flex={1} mih={0} miw={0}>
          <Flex flex="1 1 auto" mih={0} pt="xl">
            <Flex
              direction="column"
              pt="lg"
              pb="xl"
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
