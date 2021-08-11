import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import ExplicitSize from "metabase/components/ExplicitSize";
import LegendTree from "./LegendTree";
import {
  ChartContainer,
  LegendContainer,
  LegendLayoutRoot,
} from "./LegendLayout.styled";

const MIN_ITEM_WIDTH = 100;

const propTypes = {
  className: PropTypes.string,
  labels: PropTypes.array.isRequired,
  colors: PropTypes.array.isRequired,
  hovered: PropTypes.object,
  width: PropTypes.number,
  hasLegend: PropTypes.bool,
  actionButtons: PropTypes.node,
  children: PropTypes.node,
  onHoverChange: PropTypes.func,
  onAddSeries: PropTypes.func,
  onSelectSeries: PropTypes.func,
  onRemoveSeries: PropTypes.func,
};

const LegendLayout = ({
  className,
  labels,
  colors,
  hovered,
  width,
  hasLegend,
  actionButtons,
  children,
  onHoverChange,
  onAddSeries,
  onSelectSeries,
  onRemoveSeries,
}) => {
  const isNarrow = labels.length * MIN_ITEM_WIDTH > width;
  const isVertical = true;

  return (
    <LegendLayoutRoot className={className} isVertical={isVertical}>
      {hasLegend && (
        <LegendContainer isVertical={isVertical}>
          <LegendTree
            labels={labels}
            colors={colors}
            hovered={hovered}
            visibleCount={1}
            actionButtons={actionButtons}
            isNarrow={isNarrow}
            isVertical={isVertical}
            onHoverChange={onHoverChange}
            onAddSeries={onAddSeries}
            onSelectSeries={onSelectSeries}
            onRemoveSeries={onRemoveSeries}
          />
        </LegendContainer>
      )}
      <ChartContainer>{children}</ChartContainer>
    </LegendLayoutRoot>
  );
};

LegendLayout.propTypes = propTypes;

export default _.compose(ExplicitSize())(LegendLayout);
