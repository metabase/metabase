import React from "react";
import PropTypes from "prop-types";
import LegendLayout from "./LegendLayout";
import LegendCaption from "./LegendCaption";
import { ChartCaption, ChartRoot } from "./ChartWithLegend.styled";

const propTypes = {
  showCaption: PropTypes.bool,
  ...LegendCaption.propTypes,
  ...LegendLayout.propTypes,
};

const ChartWithLegend = props => {
  return (
    <ChartRoot>
      {props.showCaption && <ChartCaption {...props} />}
      <LegendLayout {...props} />
    </ChartRoot>
  );
};

ChartWithLegend.propTypes = propTypes;

export default ChartWithLegend;
