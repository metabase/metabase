import { type CSSProperties, useEffect } from "react";

import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { Box, Divider, Flex } from "metabase/ui";

import { ChartTypePicker } from "./ChartTypePicker/ChartTypePicker";
import { McpQuestionTitle } from "./McpQuestionTitle";
import { TimeGranularityControl } from "./TimeControlBar/TimeGranularityControl";
import { TimeRangeControl } from "./TimeControlBar/TimeRangeControl";
import { useMcpQueryControls } from "./hooks/useMcpQueryControls";

export interface McpQuestionViewProps {
  contentStyle: CSSProperties;
  visualizationHeight: string;

  onTimeControlsVisibilityChange: (isVisible: boolean) => void;
}

export function McpQuestionView({
  contentStyle,
  visualizationHeight,

  onTimeControlsVisibilityChange,
}: McpQuestionViewProps) {
  const {
    hasChartTypeSelector,
    hasTimeControls,
    timeGranularity,
    timeRange,
    chartTypes,
    currentChartType,
    onChartTypeChange,
  } = useMcpQueryControls();

  // This is used to adjust the parent's visualization height.
  // We leave more room for the visualization when there are no time control.
  useEffect(() => {
    onTimeControlsVisibilityChange(hasTimeControls);
  }, [hasTimeControls, onTimeControlsVisibilityChange]);

  return (
    <Flex
      direction="column"
      justify="space-between"
      h="500px"
      py="lg"
      gap="sm"
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
        <SdkQuestion.QuestionVisualization height={visualizationHeight} />
      </Flex>

      {hasTimeControls && (
        <Flex px="lg" justify="center">
          <Flex
            h={32}
            align="stretch"
            bd="1px solid var(--mb-color-border)"
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
