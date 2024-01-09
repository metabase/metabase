import { computeTrend } from "metabase/visualizations/visualizations/SmartScalar/compute";
import type { StaticVisualizationProps } from "metabase/visualizations/types";

export function SmartScalar({
  rawSeries,
  dashcardSettings,
  renderingContext,
}: StaticVisualizationProps) {
  const { formatValue, getColor } = renderingContext;
  const [{ card, data }] = rawSeries;
  const { insights } = data;

  const settings = {
    ...card.visualization_settings,
    ...dashcardSettings,
  };

  const trend = computeTrend(rawSeries, insights, settings, {
    formatValue,
    color: getColor,
  });

  if (!trend) {
    throw new Error(`Failed to compute trend data for ${card.name}`);
  }

  const { display } = trend;

  return (
    <div>
      <div>{display.value}</div>
    </div>
  );
}
