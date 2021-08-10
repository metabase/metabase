import React from "react";
import PropTypes from "prop-types";
import { iconPropTypes } from "metabase/components/Icon";
import Legend from "./Legend";
import LegendCaption from "./LegendCaption";
import {
  CaptionContainer,
  ChartContainer,
  LegendContainer,
  LegendLayoutRoot,
  MainContainer,
} from "./LegendLayout.styled";

const propTypes = {
  className: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
  labels: PropTypes.array.isRequired,
  colors: PropTypes.array.isRequired,
  hovered: PropTypes.object,
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

export default LegendLayout;
