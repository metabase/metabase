import { memo, useMemo } from "react";
import _ from "underscore";

import { Box, Flex } from "metabase/ui";

import S from "./ChartColorSample.module.css";

const BAR_HEIGHTS = [0.75, 0.875, 1];
const TICK_COUNT = 8;

export interface ChartColorSampleProps {
  colorGroups: string[][];
}

export const ChartColorSample = memo(function ChartColorSample({
  colorGroups,
}: ChartColorSampleProps) {
  const reversedGroups = useMemo(
    () => colorGroups.map((group) => [...group].reverse()),
    [colorGroups],
  );

  return (
    <Box pos="relative" h="100%">
      <Flex direction="column" justify="space-between" pos="absolute" inset={0}>
        {_.times(TICK_COUNT, (index) => (
          <Box key={index} className={S.tick} />
        ))}
        <Box className={S.axis} />
      </Flex>
      <Flex justify="space-evenly" align="flex-end" pos="absolute" inset={0}>
        {reversedGroups.map((group, index) => (
          <Flex key={index} direction="column" w="10%" h={getBarHeight(index)}>
            {group.map((color, index) => (
              <Box
                key={index}
                flex={`${index + 1} 1 auto`}
                style={{ backgroundColor: color }}
              />
            ))}
          </Flex>
        ))}
      </Flex>
    </Box>
  );
});

const getBarHeight = (index: number) => {
  return `${BAR_HEIGHTS[index % BAR_HEIGHTS.length] * 100}%`;
};
