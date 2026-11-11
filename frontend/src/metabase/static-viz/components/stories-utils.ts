import type { RawSeries, VisualizationSettings } from "metabase-types/api";

type FixtureSeries = readonly {
  card: { visualization_settings?: object };
}[];

/**
 * Returns a copy of a story fixture series with `settings` merged into the
 * first card's visualization settings.
 */
export function withVisualizationSettings(
  series: FixtureSeries,
  settings: VisualizationSettings,
): RawSeries {
  const result = series.map((single, index) =>
    index === 0
      ? {
          ...single,
          card: {
            ...single.card,
            visualization_settings: {
              ...single.card.visualization_settings,
              ...settings,
            },
          },
        }
      : single,
  );
  // The fixtures are captured API responses imported from JSON. TypeScript
  // widens JSON literals (e.g. `display` becomes `string`), so they can't be
  // checked against `RawSeries` statically.
  return result as RawSeries;
}
