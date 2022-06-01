import React, { useMemo } from "react";
import { times } from "lodash";
import {
  SampleBar,
  SampleBarItem,
  SamplePlot,
  SampleGrid,
  SampleTick,
  SampleRoot,
  SampleAxis,
} from "./ChartColorSample.styled";

const BAR_COUNT = 4;
const TICK_COUNT = 8;

export interface ChartColorSampleProps {
  colors: string[];
}

const ChartColorSample = ({ colors }: ChartColorSampleProps): JSX.Element => {
  const reversedColors = useMemo(() => [...colors].reverse(), [colors]);

  return (
    <SampleRoot>
      <SampleGrid>
        {times(TICK_COUNT, index => (
          <SampleTick key={index} />
        ))}
        <SampleAxis />
      </SampleGrid>
      <SamplePlot>
        {times(BAR_COUNT, index => (
          <SampleBar key={index}>
            {reversedColors.map((color, index) => (
              <SampleBarItem
                key={index}
                style={{ flexGrow: index + 1, backgroundColor: color }}
              />
            ))}
          </SampleBar>
        ))}
      </SamplePlot>
    </SampleRoot>
  );
};

export default ChartColorSample;
