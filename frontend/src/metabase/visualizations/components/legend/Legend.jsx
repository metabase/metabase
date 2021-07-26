import React from "react";
import PropTypes from "prop-types";
import { ActionButtons, AddSeriesIcon, LegendRoot } from "./Legend.styled";
import LegendItem from "./LegendItem";
import { normal } from "metabase/lib/colors";

const DEFAULT_COLORS = Object.values(normal);

const propTypes = {
  series: PropTypes.array.isRequired,
  settings: PropTypes.object.isRequired,
  description: PropTypes.string,
  actionButtons: PropTypes.node,
  hovered: PropTypes.shape({
    index: PropTypes.number,
  }),
  className: PropTypes.string,
  classNameWidgets: PropTypes.string,
  onAddSeries: PropTypes.func,
  onEditSeries: PropTypes.func,
  onRemoveSeries: PropTypes.func,
};

const Legend = props => {
  const {
    series,
    settings,
    description,
    actionButtons,
    hovered,
    className,
    classNameWidgets,
    onAddSeries,
  } = props;

  const showDots = onAddSeries != null || series.length > 1;
  const showTitles = !showDots;

  const seriesSettings =
    settings.series && series.map(single => settings.series(single));
  const colors = seriesSettings
    ? seriesSettings.map(s => s.color)
    : DEFAULT_COLORS;
  const titles = seriesSettings
    ? seriesSettings.map(s => s.title)
    : series.map(single => single.card.name);

  return (
    <LegendRoot className={className}>
      {series.map((s, index) => (
        <LegendItem
          key={index}
          title={titles[index]}
          color={colors[index % colors.length]}
          description={description}
          isMuted={hovered && hovered.index != null && index !== hovered.index}
          showDots={showDots}
          showTitles={showTitles}
        />
      ))}
      {onAddSeries && <AddSeriesIcon onClick={onAddSeries} />}
      {actionButtons && (
        <ActionButtons className={classNameWidgets}>
          {actionButtons}
        </ActionButtons>
      )}
    </LegendRoot>
  );
};

Legend.propTypes = propTypes;

export default Legend;
