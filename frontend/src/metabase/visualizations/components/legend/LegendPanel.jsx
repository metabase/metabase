import React from "react";
import PropTypes from "prop-types";
import {
  LegendPanelAddIcon,
  LegendPanelButtonGroup,
  LegendPanelRoot,
} from "./LegendPanel.styled";
import LegendItem from "./LegendItem";

const propTypes = {
  titles: PropTypes.array.isRequired,
  colors: PropTypes.array.isRequired,
  description: PropTypes.string,
  actionButtons: PropTypes.node,
  hovered: PropTypes.shape({
    index: PropTypes.number,
  }),
  isVertical: PropTypes.bool,
  showDots: PropTypes.bool,
  showTitles: PropTypes.bool,
  showTooltip: PropTypes.bool,
  showDotTooltip: PropTypes.bool,
  className: PropTypes.string,
  classNameWidgets: PropTypes.string,
  onAddClick: PropTypes.func,
  onRemoveClick: PropTypes.func,
  onItemClick: PropTypes.func,
  onItemMouseEnter: PropTypes.func,
  onItemMouseLeave: PropTypes.func,
};

const LegendPanel = props => {
  const {
    titles,
    colors,
    description,
    actionButtons,
    hovered,
    isVertical,
    showDots,
    showTitles,
    showTooltip,
    showDotTooltip,
    className,
    classNameWidgets,
    onAddClick,
    onRemoveClick,
    onItemClick,
    onItemMouseEnter,
    onItemMouseLeave,
  } = props;

  return (
    <LegendPanelRoot className={className} isVertical={isVertical}>
      {titles.map((title, index) => (
        <LegendItem
          key={index}
          title={title}
          index={index}
          color={colors[index % colors.length]}
          description={description}
          isMuted={hovered && hovered.index != null && index !== hovered.index}
          isVertical={isVertical}
          showDot={showDots}
          showTitle={showTitles}
          showTooltip={showTooltip}
          showDotTooltip={showDotTooltip}
          infoClassName={classNameWidgets}
          onItemClick={onItemClick}
          onItemMouseEnter={onItemMouseEnter}
          onItemMouseLeave={onItemMouseLeave}
          onRemoveClick={onRemoveClick}
        />
      ))}
      {onAddClick && <LegendPanelAddIcon onClick={onAddClick} />}
      {actionButtons && (
        <LegendPanelButtonGroup className={classNameWidgets}>
          {actionButtons}
        </LegendPanelButtonGroup>
      )}
    </LegendPanelRoot>
  );
};

LegendPanel.propTypes = propTypes;

export default LegendPanel;
