import React, { memo, useMemo } from "react";
import { times } from "lodash";
import {
  ChartAxis,
  ChartBar,
  ChartBarSection,
  ChartGrid,
  ChartPlot,
  ChartRoot,
  ChartTick,
} from "./ChartColorSample.styled";

const BAR_COUNT = 4;
const BAR_HEIGHTS = [0.75, 0.875, 1, 0.8125];
const TICK_COUNT = 8;

export interface ChartColorSampleProps {
  colors: string[];
}

const ChartColorSample = ({ colors }: ChartColorSampleProps): JSX.Element => {
  const reversedColors = useMemo(() => [...colors].reverse(), [colors]);

  return (
    <ChartRoot>
      <ChartGrid>
        {times(TICK_COUNT, index => (
          <ChartTick key={index} />
        ))}
        <ChartAxis />
      </ChartGrid>
      <ChartPlot>
        {times(BAR_COUNT, index => (
          <ChartBar key={index} style={{ height: getBarHeight(index) }}>
            {reversedColors.map((color, index) => (
              <ChartBarSection
                key={index}
                style={{ flexGrow: index + 1, backgroundColor: color }}
              />
            ))}
          </ChartBar>
        ))}
      </ChartPlot>
    </ChartRoot>
  );
};

const getBarHeight = (index: number) => {
  return `${BAR_HEIGHTS[index] * 100}%`;
};

export default memo(ChartColorSample);
