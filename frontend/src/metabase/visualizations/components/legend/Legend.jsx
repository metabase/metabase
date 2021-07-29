import React from "react";
import PropTypes from "prop-types";
import { LegendAddIcon, LegendButtonGroup, LegendRoot } from "./Legend.styled";
import LegendItem from "./LegendItem";

const propTypes = {
  className: PropTypes.string,
  classNameWidgets: PropTypes.string,
  labels: PropTypes.array.isRequired,
  colors: PropTypes.array.isRequired,
  actionButtons: PropTypes.node,
  hovered: PropTypes.object,
  isVertical: PropTypes.bool,
  showDots: PropTypes.bool,
  showLabels: PropTypes.bool,
  showTooltip: PropTypes.bool,
  showDotTooltip: PropTypes.bool,
  onHoverChange: PropTypes.func,
  onAddSeries: PropTypes.func,
  onSelectSeries: PropTypes.func,
  onRemoveSeries: PropTypes.func,
};

const Legend = ({
  className,
  classNameWidgets,
  labels,
  colors,
  actionButtons,
  hovered,
  isVertical,
  showDots,
  showLabels,
  showTooltip,
  showDotTooltip,
  onHoverChange,
  onAddSeries,
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
          showDot={showDots}
          showTitle={showLabels}
          showTooltip={showTooltip}
          showDotTooltip={showDotTooltip}
          onHoverChange={onHoverChange}
          onSelectSeries={onSelectSeries}
          onRemoveSeries={onRemoveSeries}
        />
      ))}
      {onAddSeries && <LegendAddIcon onClick={onAddSeries} />}
      {actionButtons && (
        <LegendButtonGroup className={classNameWidgets}>
          {actionButtons}
        </LegendButtonGroup>
      )}
    </LegendRoot>
  );
};

Legend.propTypes = propTypes;

export default Legend;
