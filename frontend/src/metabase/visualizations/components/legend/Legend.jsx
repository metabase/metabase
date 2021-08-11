import React from "react";
import PropTypes from "prop-types";
import {
  LegendButtonContainer,
  LegendLink,
  LegendLinkContainer,
  LegendRoot,
} from "./Legend.styled";
import LegendItem from "./LegendItem";

const propTypes = {
  className: PropTypes.string,
  labels: PropTypes.array.isRequired,
  colors: PropTypes.array.isRequired,
  hovered: PropTypes.object,
  overflowCount: PropTypes.number,
  actionButtons: PropTypes.node,
  isNarrow: PropTypes.bool,
  isVertical: PropTypes.bool,
  onHoverChange: PropTypes.func,
  onAddSeries: PropTypes.func,
  onSelectSeries: PropTypes.func,
  onRemoveSeries: PropTypes.func,
  onShowOverflow: PropTypes.func,
};

const Legend = ({
  className,
  labels,
  colors,
  hovered,
  overflowCount,
  actionButtons,
  isNarrow,
  isVertical,
  onHoverChange,
  onSelectSeries,
  onRemoveSeries,
  onShowOverflow,
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
      {overflowCount > 0 && (
        <LegendLinkContainer isVertical={isVertical}>
          <LegendLink onClick={onShowOverflow}>
            And {overflowCount} more
          </LegendLink>
        </LegendLinkContainer>
      )}
      {actionButtons && (
        <LegendButtonContainer isVertical={isVertical}>
          {actionButtons}
        </LegendButtonContainer>
      )}
    </LegendRoot>
  );
};

Legend.propTypes = propTypes;

export default Legend;
