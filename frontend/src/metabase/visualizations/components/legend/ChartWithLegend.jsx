import React from "react";
import PropTypes from "prop-types";
import LegendLayout from "./LegendLayout";
import LegendCaption from "./LegendCaption";
import { ChartCaption, ChartRoot } from "./ChartWithLegend.styled";

const propTypes = {
  className: PropTypes.string,
  showCaption: PropTypes.bool,
  ...LegendCaption.propTypes,
  ...LegendLayout.propTypes,
};

const ChartWithLegend = ({ className, showCaption, ...otherProps }) => {
  return (
    <ChartRoot className={className}>
      {showCaption && <ChartCaption {...otherProps} />}
      <LegendLayout {...otherProps} />
    </ChartRoot>
  );
};

ChartWithLegend.propTypes = propTypes;

export default ChartWithLegend;
