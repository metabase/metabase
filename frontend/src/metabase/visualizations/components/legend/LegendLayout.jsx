import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import ExplicitSize from "metabase/components/ExplicitSize";
import {
  ChartPanel,
  LegendContent,
  LegendLayoutRoot,
  LegendPanel,
} from "./LegendLayout.styled";
import Legend from "./Legend";
import LegendCaption from "./LegendCaption";

const MIN_WIDTH_PER_SERIES = 100;
const MIN_UNITS_PER_LEGEND = 6;

const propTypes = {
  className: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
  items: PropTypes.array.isRequired,
  width: PropTypes.number,
  gridSize: PropTypes.object,
  showTitle: PropTypes.bool,
  showLegend: PropTypes.bool,
  isDashboard: PropTypes.bool,
  children: PropTypes.node,
  onTitleSelect: PropTypes.func,
  onRemoveSeries: PropTypes.func,
};

const LegendLayout = ({
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
}) => {
  const isVertical = width < items.length * MIN_WIDTH_PER_SERIES;
  const isCompact = gridSize != null && gridSize.width < MIN_UNITS_PER_LEGEND;
  const isVisible = showLegend && (!isDashboard || !(isVertical && isCompact));

  return (
    <LegendLayoutRoot className={className}>
      {showTitle && (
        <LegendCaption
          title={title}
          description={description}
          onTitleSelect={onTitleSelect}
        />
      )}
      <LegendContent showTitle={showTitle} isVertical={isVertical}>
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

LegendLayout.propTypes = propTypes;

export default _.compose(ExplicitSize())(LegendLayout);
