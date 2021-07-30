import React, { forwardRef, memo } from "react";
import PropTypes from "prop-types";
import { LegendAddIcon, LegendButtonGroup, LegendRoot } from "./Legend.styled";
import LegendItem from "./LegendItem";

const propTypes = {
  className: PropTypes.string,
  labels: PropTypes.array.isRequired,
  colors: PropTypes.array.isRequired,
  hovered: PropTypes.object,
  isVertical: PropTypes.bool,
  showDots: PropTypes.bool,
  showTooltip: PropTypes.bool,
  actionButtons: PropTypes.node,
  onHoverChange: PropTypes.func,
  onAddSeries: PropTypes.func,
  onSelectSeries: PropTypes.func,
  onRemoveSeries: PropTypes.func,
};

const Legend = (
  {
    className,
    labels,
    colors,
    hovered,
    isVertical,
    showDots,
    showTooltip,
    actionButtons,
    onHoverChange,
    onAddSeries,
    onSelectSeries,
    onRemoveSeries,
  },
  ref,
) => {
  return (
    <LegendRoot className={className} innerRef={ref} isVertical={isVertical}>
      {labels.map((label, index) => (
        <LegendItem
          key={index}
          label={label}
          index={index}
          color={colors[index % colors.length]}
          isMuted={hovered && hovered.index != null && index !== hovered.index}
          isVertical={isVertical}
          showDot={showDots}
          showTooltip={showTooltip}
          onHoverChange={onHoverChange}
          onSelectSeries={onSelectSeries}
          onRemoveSeries={onRemoveSeries}
        />
      ))}
      {onAddSeries && <LegendAddIcon onClick={onAddSeries} />}
      {actionButtons && (
        <LegendButtonGroup isVertical={isVertical}>
          {actionButtons}
        </LegendButtonGroup>
      )}
    </LegendRoot>
  );
};

Legend.propTypes = propTypes;

export default memo(forwardRef(Legend));
