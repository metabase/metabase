import React, { ReactNode } from "react";
import _ from "underscore";
import ExplicitSize from "metabase/components/ExplicitSize";
import {
  ChartPanel,
  LegendContent,
  LegendLayoutRoot,
  LegendPanel,
} from "./LegendLayout.styled";
import Legend from "./Legend";
import LegendCaption from "metabase/visualizations/components/legend/LegendCaption";

const MIN_WIDTH_PER_SERIES = 100;
const MIN_UNITS_PER_LEGEND = 6;

type Props = {
  className?: string,
  classNameWidgets?: string,
  title: string,
  description?: string,
  items: string[],
  colors: string[],
  actionButtons?: ReactNode,
  hovered?: HoveredItem,
  width: number,
  height: number,
  gridSize?: GridSize,
  showTitle?: boolean,
  showLegend?: boolean,
  showDots?: boolean,
  showItems?: boolean,
  showTooltip?: boolean,
  showDotTooltip?: boolean,
  isDashboard?: boolean,
  children?: React.ReactNode,
  onTitleSelect?: (event: MouseEvent) => void,
  onHoverChange: ({ index: number, element: Element }) => void,
  onAddSeries: () => void,
  onSelectSeries: (event: MouseEvent, index: number) => void,
  onRemoveSeries: (event: MouseEvent, index: number) => void,
};

type HoveredItem = {
  index: number,
};

type GridSize = {
  width: number,
  height: number,
};

const LegendLayout = (props: Props) => {
  const {
    className,
    title,
    description,
    items,
    width,
    gridSize,
    showTitle = true,
    showLegend = true,
    isDashboard = false,
    children,
    onTitleSelect,
    ...legendProps
  } = props;

  const isVertical = width < items.length * MIN_WIDTH_PER_SERIES;
  const isCompact = gridSize != null && gridSize.width < MIN_UNITS_PER_LEGEND;
  const isVisible = showLegend && (!isDashboard || !(isVertical && isCompact));

  return (
    <LegendLayoutRoot className={className} isVertical={isVertical}>
      {showTitle && (
        <LegendCaption
          title={title}
          description={description}
          onTitleSelect={onTitleSelect}
        />
      )}
      <LegendContent>
        {isVisible && (
          <LegendPanel isVertical={isVertical}>
            <Legend {...legendProps} items={items} isVertical={isVertical} />
          </LegendPanel>
        )}
        <ChartPanel>{children}</ChartPanel>
      </LegendContent>
    </LegendLayoutRoot>
  );
};

export default _.compose(ExplicitSize())(LegendLayout);
