import { normal } from "metabase/lib/colors";

export const getLegendSettings = ({
  card,
  series,
  settings,
  showTitle,
  onAddSeries,
  onEditSeries,
  onRemoveSeries,
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

  return {
    title,
    description,
    labels,
    colors,
    showCaption,
    showLegend,
    showDots,
    hasBreakout,
  };
};
