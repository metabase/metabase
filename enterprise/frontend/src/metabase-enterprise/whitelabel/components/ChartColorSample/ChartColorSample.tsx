import React, { memo, useMemo } from "react";
import { times } from "lodash";
import {
  ChartBar,
  ChartBarSection,
  ChartPlot,
  ChartGrid,
  ChartTick,
  ChartRoot,
  ChartAxis,
} from "./ChartColorSample.styled";

const BAR_COUNT = 4;
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
                style={{
                  flexGrow: getBarSectionHeight(index),
                  backgroundColor: color,
                }}
              />
            ))}
          </ChartBar>
        ))}
      </ChartPlot>
    </ChartRoot>
  );
};

const getBarHeight = (index: number) => {
  return index === 0 ? "87.5%" : "100%";
};

const getBarSectionHeight = (index: number) => {
  return index + 1;
};

export default memo(ChartColorSample);
