import React from "react";
import { times } from "lodash";
import {
  SketchBar,
  SketchBarItem,
  SketchPlot,
  SketchGrid,
  SketchGridLine,
  SketchRoot,
} from "./ChartColorSketch.styled";

const BAR_COUNT = 4;
const LINE_COUNT = 9;

export interface ChartColorSketchProps {
  colors: string[];
}

const ChartColorSketch = ({ colors }: ChartColorSketchProps): JSX.Element => {
  return (
    <SketchRoot>
      <SketchGrid>
        {times(LINE_COUNT, index => (
          <SketchGridLine key={index} />
        ))}
      </SketchGrid>
      <SketchPlot>
        {times(BAR_COUNT, index => (
          <SketchBar key={index}>
            {colors.map((color, index) => (
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
