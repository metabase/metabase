import React, { useCallback, useMemo } from "react";
import PropTypes from "prop-types";
import { normal } from "metabase/lib/colors";
import LegendPanel from "./LegendPanel";

const DEFAULT_COLORS = Object.values(normal);

const propTypes = {
  series: PropTypes.array.isRequired,
  settings: PropTypes.object.isRequired,
  description: PropTypes.string,
  actionButtons: PropTypes.node,
  hovered: PropTypes.shape({
    index: PropTypes.number,
  }),
  visualizationIsClickable: PropTypes.func,
  className: PropTypes.string,
  classNameWidgets: PropTypes.string,
  onAddSeries: PropTypes.func,
  onEditSeries: PropTypes.func,
  onRemoveSeries: PropTypes.func,
  onHoverChange: PropTypes.func,
  onVisualizationClick: PropTypes.func,
  onChangeCardAndRun: PropTypes.func,
};

const Legend = props => {
  const {
    series,
    settings,
    description,
    actionButtons,
    hovered,
    visualizationIsClickable,
    className,
    classNameWidgets,
    onAddSeries,
    onEditSeries,
    onRemoveSeries,
    onHoverChange,
    onVisualizationClick,
    onChangeCardAndRun,
  } = props;

  const showDots = onAddSeries != null || series.length > 1;
  const showTitles = !showDots;

  const seriesSettings = useMemo(() => {
    return settings.series && series.map(single => settings.series(single));
  }, [series, settings]);

  const colors = useMemo(() => {
    return seriesSettings ? seriesSettings.map(s => s.color) : DEFAULT_COLORS;
  }, [seriesSettings]);

  const titles = useMemo(() => {
    return seriesSettings
      ? seriesSettings.map(s => s.title)
      : series.map(single => single.card.name);
  }, [series, seriesSettings]);

  const handleLabelClick = useCallback(
    (event, index) => {
      const item = series[index];

      if (onEditSeries) {
        onEditSeries(event, index);
      } else if (item.clicked && visualizationIsClickable(item.clicked)) {
        onVisualizationClick({ ...item.clicked, element: event.currentTarget });
      } else if (onChangeCardAndRun) {
        onChangeCardAndRun({ nextCard: item.card, seriesIndex: index });
      }
    },
    [
      series,
      visualizationIsClickable,
      onEditSeries,
      onVisualizationClick,
      onChangeCardAndRun,
    ],
  );

  const handleLabelMouseEnter = useCallback(
    (event, index) => {
      onHoverChange && onHoverChange({ index });
    },
    [onHoverChange],
  );

  const handleLabelMouseLeave = useCallback(() => {
    onHoverChange && onHoverChange(null);
  }, [onHoverChange]);

  return (
    <LegendPanel
      titles={titles}
      colors={colors}
      description={description}
      actionButtons={actionButtons}
      hovered={hovered}
      showDots={showDots}
      showTitles={showTitles}
      className={className}
      classNameWidgets={classNameWidgets}
      onAddClick={onAddSeries}
      onRemoveClick={onRemoveSeries}
      onLabelClick={handleLabelClick}
      onLabelMouseEnter={handleLabelMouseEnter}
      onLabelMouseLeave={handleLabelMouseLeave}
    />
  );
};

Legend.propTypes = propTypes;

export default Legend;
