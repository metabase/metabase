import { type CSSProperties, useEffect } from "react";

import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { Box, Flex } from "metabase/ui";

import { McpQuestionTitle } from "./McpQuestionTitle";
import { McpVisualizationTypeSelector } from "./McpVisualizationTypeSelector";
import { TimeControlBar } from "./TimeControlBar";
import { useMcpQueryControls } from "./hooks/useMcpQueryControls";

interface McpTimeControlsProps {
  onVisibilityChange?: (isVisible: boolean) => void;
}

export interface McpQuestionViewProps {
  contentStyle: CSSProperties;
  isTimeControlsVisible: boolean;
  onTimeControlsVisibilityChange: (isVisible: boolean) => void;
  visualizationHeight: string;
}

export function McpQuestionView({
  contentStyle,
  isTimeControlsVisible,
  onTimeControlsVisibilityChange,
  visualizationHeight,
}: McpQuestionViewProps) {
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
          <McpVisualizationTypeSelector />
        </Flex>
      </Flex>

      <Flex px="xs" flex={1} style={{ overflow: "hidden" }}>
        <SdkQuestion.QuestionVisualization height={visualizationHeight} />
      </Flex>

      {isTimeControlsVisible && (
        <Flex px="lg" justify="center">
          <McpTimeControls
            onVisibilityChange={onTimeControlsVisibilityChange}
          />
        </Flex>
      )}

      {!isTimeControlsVisible && (
        <McpTimeControls onVisibilityChange={onTimeControlsVisibilityChange} />
      )}
    </Flex>
  );
}

function McpTimeControls({ onVisibilityChange }: McpTimeControlsProps) {
  const { hasTimeControls, timeGranularity, timeRange } = useMcpQueryControls();

  useEffect(() => {
    onVisibilityChange?.(hasTimeControls);
  }, [hasTimeControls, onVisibilityChange]);

  if (!hasTimeControls) {
    return null;
  }

  return (
    <TimeControlBar timeRange={timeRange} timeGranularity={timeGranularity} />
  );
}
