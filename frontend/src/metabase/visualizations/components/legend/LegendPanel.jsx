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
  direction: PropTypes.oneOf(["horizontal", "vertical"]),
  description: PropTypes.string,
  actionButtons: PropTypes.node,
  hovered: PropTypes.shape({
    index: PropTypes.number,
  }),
  showDots: PropTypes.bool,
  showTitles: PropTypes.bool,
  className: PropTypes.string,
  classNameWidgets: PropTypes.string,
  onAddClick: PropTypes.func,
  onRemoveClick: PropTypes.func,
  onLabelClick: PropTypes.func,
  onLabelMouseEnter: PropTypes.func,
  onLabelMouseLeave: PropTypes.func,
};

const LegendPanel = props => {
  const {
    titles,
    colors,
    direction,
    description,
    actionButtons,
    hovered,
    showDots,
    showTitles,
    className,
    classNameWidgets,
    onAddClick,
    onRemoveClick,
    onLabelClick,
    onLabelMouseEnter,
    onLabelMouseLeave,
  } = props;

  return (
    <LegendPanelRoot className={className} direction={direction}>
      {titles.map((title, index) => (
        <LegendItem
          key={index}
          title={title}
          index={index}
          color={colors[index % colors.length]}
          description={description}
          isMuted={hovered && hovered.index != null && index !== hovered.index}
          showDots={showDots}
          showTitles={showTitles}
          infoClassName={classNameWidgets}
          onLabelClick={onLabelClick}
          onLabelMouseEnter={onLabelMouseEnter}
          onLabelMouseLeave={onLabelMouseLeave}
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
