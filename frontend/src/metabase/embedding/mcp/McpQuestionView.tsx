import type { CSSProperties } from "react";

import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { Box, Divider, Flex } from "metabase/ui";

import { ChartTypePicker } from "./ChartTypePicker/ChartTypePicker";
import { McpQuestionTitle } from "./McpQuestionTitle";
import { TimeGranularityControl } from "./TimeControlBar/TimeGranularityControl";
import { TimeRangeControl } from "./TimeControlBar/TimeRangeControl";
import { useMcpQueryControls } from "./hooks/useMcpQueryControls";

export const MCP_CONTENT_HEIGHT = "500px";

const QUERY_BAR_RESERVED_HEIGHT = "calc(2rem + var(--mantine-spacing-sm))";
const RECLAIMED_CONTENT_BOTTOM_PADDING = "var(--mantine-spacing-lg)";

export interface McpQuestionViewProps {
  queryKey: string | null;
  safeAreaPaddingTop: number;
}

export function McpQuestionView({
  queryKey,
  safeAreaPaddingTop,
}: McpQuestionViewProps) {
  const {
    hasChartTypeSelector,
    hasTimeControls,
    timeGranularity,
    timeRange,
    chartTypes,
    currentChartType,
    onChartTypeChange,
  } = useMcpQueryControls(queryKey);

  const isTableVisualization = currentChartType === "table";

  // When table has no time controls, we can remove vertical padding and increase height.
  const shouldUseFullHeightTable = isTableVisualization && !hasTimeControls;

  const baseVisualizationHeight = hasTimeControls
    ? `calc(${MCP_CONTENT_HEIGHT} - 8.5rem)`
    : `calc(${MCP_CONTENT_HEIGHT} - 8.5rem + ${QUERY_BAR_RESERVED_HEIGHT})`;

  const tableVisualizationHeight = `calc(${baseVisualizationHeight} + ${RECLAIMED_CONTENT_BOTTOM_PADDING} + ${safeAreaPaddingTop}px)`;

  const resolvedVisualizationHeight = shouldUseFullHeightTable
    ? tableVisualizationHeight
    : baseVisualizationHeight;

  // We cannot reduce top padding when chart type selector is shown,
  // as switching between them will cause layout shift due to height change.
  const shouldReduceTopPadding =
    shouldUseFullHeightTable && !hasChartTypeSelector;

  const contentStyle: CSSProperties = {
    boxSizing: "border-box",
    paddingTop: shouldReduceTopPadding
      ? "calc(var(--mantine-spacing-lg) + 0px)"
      : `calc(var(--mantine-spacing-lg) + ${safeAreaPaddingTop}px)`,
  };

  return (
    <Flex
      direction="column"
      justify="space-between"
      h={MCP_CONTENT_HEIGHT}
      gap="sm"
      pb={shouldUseFullHeightTable ? undefined : "lg"}
      style={contentStyle}
    >
      <Flex
        px="lg"
        align="center"
        justify="space-between"
        gap="sm"
        flex="0 0 auto"
      >
        <Box flex={1} miw={0}>
          <McpQuestionTitle />
        </Box>

        <Flex align="center" flex="0 0 auto">
          {hasChartTypeSelector && (
            <ChartTypePicker
              chartTypes={chartTypes}
              value={currentChartType}
              onChange={onChartTypeChange}
            />
          )}
        </Flex>
      </Flex>

      <Flex px="xs" flex={1} style={{ overflow: "hidden" }}>
        <SdkQuestion.QuestionVisualization
          height={resolvedVisualizationHeight}
        />
      </Flex>

      {hasTimeControls && (
        <Flex px="lg" justify="center">
          <Flex
            h={32}
            align="stretch"
            bd="1px solid var(--mb-color-border-neutral)"
            bdrs="md"
            style={{ overflow: "hidden" }}
            data-testid="query-explorer-bar"
          >
            {timeRange && <TimeRangeControl timeRange={timeRange} />}

            {timeRange && timeGranularity && <Divider orientation="vertical" />}

            {timeGranularity && (
              <TimeGranularityControl timeGranularity={timeGranularity} />
            )}
          </Flex>
        </Flex>
      )}
    </Flex>
  );
}
