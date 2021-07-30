import React from "react";
import PropTypes from "prop-types";
import { ChartWithLegendRoot } from "./ChartWithLegend.styled";
import LegendTitle from "./LegendTitle";
import LegendLayout from "./LegendLayout";

const propTypes = {
  className: PropTypes.string,
  showTitle: PropTypes.bool,
  children: PropTypes.node,
  ...LegendLayout.propTypes,
};

const ChartWithLegend = ({ className, showTitle, children, ...otherProps }) => {
  return (
    <ChartWithLegendRoot className={className}>
      {showTitle && <LegendTitle {...otherProps} />}
      <LegendLayout {...otherProps}>{children}</LegendLayout>
    </ChartWithLegendRoot>
  );
};

ChartWithLegend.propTypes = propTypes;

export default ChartWithLegend;
