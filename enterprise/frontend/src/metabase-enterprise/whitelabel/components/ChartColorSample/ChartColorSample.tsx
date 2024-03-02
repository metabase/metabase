import { memo, useMemo } from "react";
import _ from "underscore";

import {
  ChartAxis,
  ChartBar,
  ChartBarSection,
  ChartGrid,
  ChartPlot,
  ChartRoot,
  ChartTick,
} from "./ChartColorSample.styled";

const BAR_HEIGHTS = [0.75, 0.875, 1];
const TICK_COUNT = 8;

export interface ChartColorSampleProps {
  colorGroups: string[][];
}

const ChartColorSample = ({
  colorGroups,
}: ChartColorSampleProps): JSX.Element => {
  const reversedGroups = useMemo(
    () => colorGroups.map(group => [...group].reverse()),
    [colorGroups],
  );

  return (
    <ChartRoot>
      <ChartGrid>
        {_.times(TICK_COUNT, index => (
          <ChartTick key={index} />
        ))}
        <ChartAxis />
      </ChartGrid>
      <ChartPlot>
        {reversedGroups.map((group, index) => (
          <ChartBar key={index} style={{ height: getBarHeight(index) }}>
            {group.map((color, index) => (
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
  return `${BAR_HEIGHTS[index % BAR_HEIGHTS.length] * 100}%`;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(ChartColorSample);
