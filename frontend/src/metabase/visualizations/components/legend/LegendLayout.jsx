import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import ExplicitSize from "metabase/components/ExplicitSize";
import {
  ChartPanel,
  LegendLayoutRoot,
  LegendPanel,
} from "./LegendLayout.styled";
import Legend from "metabase/visualizations/components/legend/Legend";

const MIN_WIDTH_PER_SERIES = 100;
const MIN_UNITS_PER_LEGEND = 6;

const propTypes = {
  className: PropTypes.string,
  labels: PropTypes.array.isRequired,
  width: PropTypes.number,
  gridSize: PropTypes.object,
  showLegend: PropTypes.bool,
  isDashboard: PropTypes.bool,
  children: PropTypes.node,
  ...Legend.propTypes,
};

const LegendLayout = ({
  className,
  labels,
  width,
  gridSize,
  showLegend,
  isDashboard,
  children,
  ...otherProps
}) => {
  const isVertical = width < labels.length * MIN_WIDTH_PER_SERIES;
  const isCompact = gridSize != null && gridSize.width < MIN_UNITS_PER_LEGEND;
  const isVisible = showLegend && (!isDashboard || !(isVertical && isCompact));

  return (
    <LegendLayoutRoot className={className} isVertical={isVertical}>
      {isVisible && (
        <LegendPanel isVertical={isVertical}>
          <Legend {...otherProps} labels={labels} isVertical={isVertical} />
        </LegendPanel>
      )}
      <ChartPanel>{children}</ChartPanel>
    </LegendLayoutRoot>
  );
};

LegendLayout.propTypes = propTypes;

export default _.compose(ExplicitSize())(LegendLayout);
