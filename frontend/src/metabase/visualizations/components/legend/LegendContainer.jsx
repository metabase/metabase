import React from "react";
import _ from "underscore";
import ExplicitSize from "metabase/components/ExplicitSize";
import {
  ChartPanel,
  LegendContainerRoot,
  LegendPanel,
} from "./LegendContainer.styled";
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

const LegendContainer = (props: Props) => {
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
    <LegendContainerRoot className={className} isVertical={isVertical}>
      {isVisible && (
        <LegendPanel isVertical={isVertical}>
          <Legend {...legendProps} titles={titles} isVertical={isVertical} />
        </LegendPanel>
      )}
      <ChartPanel>{children}</ChartPanel>
    </LegendContainerRoot>
  );
};

export default _.compose(ExplicitSize())(LegendContainer);
