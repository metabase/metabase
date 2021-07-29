import { normal } from "metabase/lib/colors";

export const getLegendSettings = ({
  card,
  series,
  settings,
  showTitle,
  visualizationIsClickable,
  onAddSeries,
  onEditSeries,
  onRemoveSeries,
  onVisualizationClick,
  onChangeCardAndRun,
}) => {
  const title = settings["card.title"] || card.title;
  const description = settings["card.description"];
  const showCaption = showTitle && !!title;
  const hasBreakout = card._breakoutColumn != null;
  const showLegend =
    series.length > 1 ||
    onAddSeries != null ||
    onEditSeries != null ||
    onRemoveSeries != null;
  const showDots = series.length > 1 || onAddSeries != null;

  const seriesSettings =
    settings.series && series.map(single => settings.series(single));
  const labels = seriesSettings
    ? seriesSettings.map(s => s.title)
    : series.map(single => single.card.name);
  const colors = seriesSettings
    ? seriesSettings.map(s => s.color)
    : Object.values(normal);

  const onSelectTitle = () => {
    if (onChangeCardAndRun) {
      onChangeCardAndRun({ nextCard: card, seriesIndex: 0 });
    }
  };

  const onSelectSeries = (event, index) => {
    const data = series[index];

    if (onEditSeries && !card._breakoutColumn) {
      onEditSeries(event, index);
    } else if (data.clicked && visualizationIsClickable(data.clicked)) {
      const data = { ...data.clicked, element: event.currentTarget };
      onVisualizationClick(data);
    } else if (onChangeCardAndRun) {
      onChangeCardAndRun({ nextCard: data.card, seriesIndex: index });
    }
  };

  return {
    title,
    description,
    labels,
    colors,
    showCaption,
    showLegend,
    showDots,
    hasBreakout,
    onSelectTitle,
    onSelectSeries,
  };
};
