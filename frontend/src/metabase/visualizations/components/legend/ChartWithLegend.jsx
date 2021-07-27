import React from "react";
import _ from "underscore";
import ExplicitSize from "metabase/components/ExplicitSize";
import {
  ChartContent,
  ChartWithLegendRoot,
  LegendContent,
} from "./ChartWithLegend.styled";
import Legend from "./Legend";

const MIN_WIDTH_PER_SERIES = 100;
const MIN_UNITS_PER_LEGEND = 6;

type Props = {
  className?: string,
  titles: string[],
  width: number,
  height: number,
  gridSize?: GridSize,
  showLegend?: boolean,
  isDashboard?: boolean,
  children?: React.ReactNode,
};

type GridSize = {
  width: number,
  height: number,
};

const ChartWithLegend = (props: Props) => {
  const {
    className,
    titles,
    width,
    gridSize,
    showLegend = true,
    isDashboard = false,
    children,
    ...legendProps
  } = props;
  const isVertical = width < titles.length * MIN_WIDTH_PER_SERIES;
  const isCompact = gridSize != null && gridSize.width < MIN_UNITS_PER_LEGEND;
  const isVisible = showLegend && (!isDashboard || !(isVertical && isCompact));

  return (
    <ChartWithLegendRoot className={className} isVertical={isVertical}>
      {isVisible && (
        <LegendContent isVertical={isVertical}>
          <Legend {...legendProps} titles={titles} isVertical={isVertical} />
        </LegendContent>
      )}
      <ChartContent>{children}</ChartContent>
    </ChartWithLegendRoot>
  );
};

export default _.compose(ExplicitSize())(ChartWithLegend);
