import React from "react";
import PropTypes from "prop-types";
import { ChartRoot, ChartTitle } from "./ChartWithLegend.styled";
import LegendTitle from "./LegendTitle";
import LegendLayout from "./LegendLayout";

const propTypes = {
  className: PropTypes.string,
  showTitle: PropTypes.bool,
  actionButtons: PropTypes.node,
  children: PropTypes.node,
  ...LegendTitle.propTypes,
  ...LegendLayout.propTypes,
};

const ChartWithLegend = ({
  className,
  showTitle,
  actionButtons,
  children,
  ...otherProps
}) => {
  return (
    <ChartRoot className={className}>
      {showTitle && (
        <ChartTitle {...otherProps} actionButtons={actionButtons} />
      )}
      <LegendLayout {...otherProps} actionButtons={!showTitle && actionButtons}>
        {children}
      </LegendLayout>
    </ChartRoot>
  );
};

ChartWithLegend.propTypes = propTypes;

export default ChartWithLegend;
