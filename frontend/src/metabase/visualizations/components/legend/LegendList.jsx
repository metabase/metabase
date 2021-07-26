import React, { Fragment } from "react";
import PropTypes from "prop-types";
import {
  ActionButtons,
  AddSeriesIcon,
  LegendRoot,
  RemoveSeriesIcon,
} from "./LegendList.styled";
import LegendItem from "./LegendItem";

const propTypes = {
  titles: PropTypes.array.isRequired,
  colors: PropTypes.object.isRequired,
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
  onItemClick: PropTypes.func,
  onItemMouseEnter: PropTypes.func,
  onItemMouseLeave: PropTypes.func,
};

const LegendList = props => {
  const {
    titles,
    colors,
    description,
    actionButtons,
    hovered,
    showDots,
    showTitles,
    className,
    classNameWidgets,
    onAddClick,
    onRemoveClick,
    onItemClick,
    onItemMouseEnter,
    onItemMouseLeave,
  } = props;

  return (
    <LegendRoot className={className}>
      {titles.map((title, index) => (
        <Fragment key={index}>
          <LegendItem
            title={title}
            color={colors[index % colors.length]}
            index={index}
            description={description}
            isMuted={
              hovered && hovered.index != null && index !== hovered.index
            }
            showDots={showDots}
            showTitles={showTitles}
            infoClassName={classNameWidgets}
            onClick={onItemClick}
            onMouseEnter={onItemMouseEnter}
            onMouseLeave={onItemMouseLeave}
          />
          {onRemoveClick && <RemoveSeriesIcon onClick={onRemoveClick} />}
        </Fragment>
      ))}
      {onAddClick && <AddSeriesIcon onClick={onAddClick} />}
      {actionButtons && (
        <ActionButtons className={classNameWidgets}>
          {actionButtons}
        </ActionButtons>
      )}
    </LegendRoot>
  );
};

LegendList.propTypes = propTypes;

export default LegendList;
