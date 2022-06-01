import React, { useMemo } from "react";
import { times } from "lodash";
import {
  SketchBar,
  SketchBarItem,
  SketchPlot,
  SketchGrid,
  SketchTick,
  SketchRoot,
  SketchAxis,
} from "./ChartColorSketch.styled";

const BAR_COUNT = 4;
const TICK_COUNT = 8;

export interface ChartColorSketchProps {
  colors: string[];
}

const ChartColorSketch = ({ colors }: ChartColorSketchProps): JSX.Element => {
  const reversedColors = useMemo(() => [...colors].reverse(), [colors]);

  return (
    <SketchRoot>
      <SketchGrid>
        {times(TICK_COUNT, index => (
          <SketchTick key={index} />
        ))}
        <SketchAxis />
      </SketchGrid>
      <SketchPlot>
        {times(BAR_COUNT, index => (
          <SketchBar key={index}>
            {reversedColors.map((color, index) => (
              <SketchBarItem
                key={index}
                style={{ flexGrow: index + 1, backgroundColor: color }}
              />
            ))}
          </SketchBar>
        ))}
      </SketchPlot>
    </SketchRoot>
  );
};

export default ChartColorSketch;
