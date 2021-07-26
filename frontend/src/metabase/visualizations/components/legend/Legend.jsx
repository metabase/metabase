import React, { useCallback, useMemo, Fragment } from "react";
import PropTypes from "prop-types";
import {
  ActionButtons,
  AddSeriesIcon,
  LegendRoot,
  RemoveSeriesIcon,
} from "./Legend.styled";
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

  const handleClick = useCallback(
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

  const handleMouseEnter = useCallback(
    (event, index) => {
      onHoverChange && onHoverChange({ index });
    },
    [onHoverChange],
  );

  const handleMouseLeave = useCallback(() => {
    onHoverChange && onHoverChange(null);
  }, [onHoverChange]);

  return (
    <LegendRoot className={className}>
      {series.map((item, index) => (
        <Fragment key={index}>
          <LegendItem
            title={titles[index]}
            color={colors[index % colors.length]}
            index={index}
            description={description}
            isMuted={
              hovered && hovered.index != null && index !== hovered.index
            }
            showDots={showDots}
            showTitles={showTitles}
            infoClassName={classNameWidgets}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          />
          {onRemoveSeries && series.length > 1 && <RemoveSeriesIcon />}
        </Fragment>
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
