import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { iconPropTypes } from "metabase/components/Icon";
import ExplicitSize from "metabase/components/ExplicitSize";
import Legend from "./Legend";
import LegendCaption from "./LegendCaption";
import {
  CaptionContainer,
  ChartContainer,
  LegendContainer,
  LegendLayoutRoot,
  MainContainer,
} from "./LegendLayout.styled";

const MIN_ITEM_WIDTH = 100;

const propTypes = {
  className: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
  labels: PropTypes.array.isRequired,
  colors: PropTypes.array.isRequired,
  hovered: PropTypes.object,
  width: PropTypes.number,
  hasTitle: PropTypes.bool,
  hasLegend: PropTypes.bool,
  icon: PropTypes.shape(iconPropTypes),
  actionButtons: PropTypes.node,
  children: PropTypes.node,
  onSelectTitle: PropTypes.func,
  onHoverChange: PropTypes.func,
  onAddSeries: PropTypes.func,
  onSelectSeries: PropTypes.func,
  onRemoveSeries: PropTypes.func,
};

const LegendLayout = ({
  className,
  title,
  description,
  labels,
  colors,
  hovered,
  width,
  hasTitle,
  hasLegend,
  icon,
  actionButtons,
  children,
  onSelectTitle,
  onHoverChange,
  onAddSeries,
  onSelectSeries,
  onRemoveSeries,
}) => {
  const isNarrow = labels.length * MIN_ITEM_WIDTH > width;

  return (
    <LegendLayoutRoot className={className}>
      {hasTitle && (
        <CaptionContainer>
          <LegendCaption
            title={title}
            description={description}
            icon={icon}
            actionButtons={actionButtons}
            onSelectTitle={onSelectTitle}
          />
        </CaptionContainer>
      )}
      <MainContainer>
        {hasLegend && (
          <LegendContainer>
            <Legend
              labels={labels}
              colors={colors}
              hovered={hovered}
              actionButtons={!hasTitle && actionButtons}
              isNarrow={isNarrow}
              onHoverChange={onHoverChange}
              onAddSeries={onAddSeries}
              onSelectSeries={onSelectSeries}
              onRemoveSeries={onRemoveSeries}
            />
          </LegendContainer>
        )}
        <ChartContainer>{children}</ChartContainer>
      </MainContainer>
    </LegendLayoutRoot>
  );
};

LegendLayout.propTypes = propTypes;

export default _.compose(ExplicitSize())(LegendLayout);
