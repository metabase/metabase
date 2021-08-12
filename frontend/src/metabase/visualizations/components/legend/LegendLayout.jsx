import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import ExplicitSize from "metabase/components/ExplicitSize";
import Legend from "./Legend";
import {
  ChartContainer,
  LegendContainer,
  LegendLayoutRoot,
  MainContainer,
} from "./LegendLayout.styled";
import LegendActions from "metabase/visualizations/components/legend/LegendActions";

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
  const isVertical = false;

  return (
    <LegendLayoutRoot className={className} isVertical={isVertical}>
      {hasLegend && (
        <LegendContainer isVertical={isVertical}>
          <Legend
            labels={labels}
            colors={colors}
            hovered={hovered}
            actionButtons={actionButtons}
            isNarrow={isNarrow}
            isVertical={isVertical}
            onHoverChange={onHoverChange}
            onAddSeries={onAddSeries}
            onSelectSeries={onSelectSeries}
            onRemoveSeries={onRemoveSeries}
          />
          {!isVertical && actionButtons && (
            <LegendActions>{actionButtons}</LegendActions>
          )}
        </LegendContainer>
      )}
      <MainContainer>
        {isVertical && actionButtons && (
          <LegendActions>{actionButtons}</LegendActions>
        )}
        <ChartContainer>{children}</ChartContainer>
      </MainContainer>
    </LegendLayoutRoot>
  );
};

LegendLayout.propTypes = propTypes;

export default _.compose(ExplicitSize())(LegendLayout);
