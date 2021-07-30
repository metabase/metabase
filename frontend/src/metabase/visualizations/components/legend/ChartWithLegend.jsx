import React from "react";
import PropTypes from "prop-types";
import { ChartRoot, ChartTitle } from "./ChartWithLegend.styled";
import LegendLayout from "./LegendLayout";

const propTypes = {
  className: PropTypes.string,
  showTitle: PropTypes.bool,
  children: PropTypes.node,
  ...LegendLayout.propTypes,
};

const ChartWithLegend = ({ className, showTitle, children, ...otherProps }) => {
  return (
    <ChartRoot className={className}>
      {showTitle && <ChartTitle {...otherProps} />}
      <LegendLayout {...otherProps}>{children}</LegendLayout>
    </ChartRoot>
  );
};

ChartWithLegend.propTypes = propTypes;

export default ChartWithLegend;
