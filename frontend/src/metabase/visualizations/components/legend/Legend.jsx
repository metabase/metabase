import React from "react";
import PropTypes from "prop-types";
import { LegendButtonGroup, LegendRoot } from "./Legend.styled";
import LegendItem from "./LegendItem";

const propTypes = {
  className: PropTypes.string,
  labels: PropTypes.array.isRequired,
  colors: PropTypes.array.isRequired,
  hovered: PropTypes.object,
  actionButtons: PropTypes.node,
  isNarrow: PropTypes.bool,
  isVertical: PropTypes.bool,
  onHoverChange: PropTypes.func,
  onAddSeries: PropTypes.func,
  onSelectSeries: PropTypes.func,
  onRemoveSeries: PropTypes.func,
};

const Legend = ({
  className,
  labels,
  colors,
  hovered,
  actionButtons,
  isNarrow,
  isVertical,
  onHoverChange,
  onSelectSeries,
  onRemoveSeries,
}) => {
  return (
    <LegendRoot className={className} isVertical={isVertical}>
      {labels.map((label, index) => (
        <LegendItem
          key={index}
          label={label}
          index={index}
          color={colors[index % colors.length]}
          isMuted={hovered && hovered.index != null && index !== hovered.index}
          isNarrow={isNarrow}
          isVertical={isVertical}
          onHoverChange={onHoverChange}
          onSelectSeries={onSelectSeries}
          onRemoveSeries={onRemoveSeries}
        />
      ))}
      {actionButtons && (
        <LegendButtonGroup isVertical={isVertical}>
          {actionButtons}
        </LegendButtonGroup>
      )}
    </LegendRoot>
  );
};

Legend.propTypes = propTypes;

export default Legend;
