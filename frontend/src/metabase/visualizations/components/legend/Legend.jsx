import React from "react";
import PropTypes from "prop-types";
import { LegendButton, LegendButtonGroup, LegendRoot } from "./Legend.styled";
import LegendItem from "./LegendItem";

const propTypes = {
  className: PropTypes.string,
  labels: PropTypes.array.isRequired,
  colors: PropTypes.array.isRequired,
  hovered: PropTypes.object,
  actionButtons: PropTypes.node,
  isVertical: PropTypes.bool,
  overflowCount: PropTypes.number,
  onHoverChange: PropTypes.func,
  onShowSeries: PropTypes.func,
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
  isVertical,
  overflowCount,
  onHoverChange,
  onShowSeries,
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
          isVertical={isVertical}
          onHoverChange={onHoverChange}
          onSelectSeries={onSelectSeries}
          onRemoveSeries={onRemoveSeries}
        />
      ))}
      {overflowCount > 0 && (
        <LegendButton onClick={onShowSeries}>
          And {overflowCount} more
        </LegendButton>
      )}
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
