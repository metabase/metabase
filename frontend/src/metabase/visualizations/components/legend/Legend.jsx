import React, { useLayoutEffect } from "react";
import _ from "underscore";
import PropTypes from "prop-types";
import ExplicitSize from "metabase/components/ExplicitSize";
import { LegendAddIcon, LegendButtonGroup, LegendRoot } from "./Legend.styled";
import LegendItem from "./LegendItem";

const MIN_WIDTH_PER_SERIES = 100;

const propTypes = {
  titles: PropTypes.array.isRequired,
  colors: PropTypes.array.isRequired,
  description: PropTypes.string,
  actionButtons: PropTypes.node,
  width: PropTypes.number,
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
  onHoverChange: PropTypes.func,
  onAddSeries: PropTypes.func,
  onSelectSeries: PropTypes.func,
  onRemoveSeries: PropTypes.func,
  onOrientationChange: PropTypes.func,
};

const Legend = props => {
  const {
    titles,
    colors,
    description,
    actionButtons,
    width,
    hovered,
    isVertical,
    showDots,
    showTitles,
    showTooltip,
    showDotTooltip,
    className,
    classNameWidgets,
    onHoverChange,
    onAddSeries,
    onSelectSeries,
    onRemoveSeries,
    onOrientationChange,
  } = props;

  useLayoutEffect(() => {
    const isOverflow = width < MIN_WIDTH_PER_SERIES * titles.length;

    if (isVertical !== isOverflow) {
      onOrientationChange && onOrientationChange(isOverflow);
    }
  }, [width, titles, isVertical, onOrientationChange]);

  return (
    <LegendRoot className={className} isVertical={isVertical}>
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

export default _.compose(ExplicitSize())(Legend);
