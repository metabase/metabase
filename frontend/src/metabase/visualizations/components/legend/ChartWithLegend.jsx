import React from "react";
import PropTypes from "prop-types";
import {
  ChartContent,
  ChartLegend,
  ChartWithLegendRoot,
} from "./ChartWithLegend.styled";
import LegendPanel from "./LegendPanel";

const propTypes = {
  className: PropTypes.string,
  showLegend: PropTypes.bool,
  children: PropTypes.node,
};

const ChartWithLegend = props => {
  const { className, showLegend, children, ...legendProps } = props;

  return (
    <ChartWithLegendRoot className={className}>
      {showLegend && (
        <ChartLegend>
          <LegendPanel {...legendProps} isVertical />
        </ChartLegend>
      )}
      <ChartContent>{children}</ChartContent>
    </ChartWithLegendRoot>
  );
};

ChartWithLegend.propTypes = propTypes;

export default ChartWithLegend;
