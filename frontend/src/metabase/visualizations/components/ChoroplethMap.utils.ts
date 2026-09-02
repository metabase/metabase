import type { Feature } from "geojson";

import { sumMetric } from "metabase/viz-core";
import type {
  CardId,
  DatasetColumn,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";

export type FeatureClickContext = {
  cols: DatasetColumn[];
  dimensionIndex: number;
  metricIndex: number;
  settings: VisualizationSettings;
  getFeatureName: (feature: Feature) => string;
  getFeatureKey: (feature: Feature, opts?: { lowerCase?: boolean }) => string;
  cardId: CardId | undefined;
};

export function buildFeatureClickObject(
  rows: RowValue[][] | undefined,
  feature: Feature | null,
  ctx: FeatureClickContext,
) {
  const {
    cols,
    dimensionIndex,
    metricIndex,
    settings,
    getFeatureName,
    getFeatureKey,
    cardId,
  } = ctx;

  // This branch lets you click on empty regions. We use in dashboard cross-filtering.
  if (rows == null || rows.length === 0) {
    return {
      value: null,
      column: cols[metricIndex],
      dimensions: [],
      data: feature
        ? [
            {
              key: cols[dimensionIndex].display_name,
              value: getFeatureKey(feature, { lowerCase: false }),
              col: cols[dimensionIndex],
            },
          ]
        : [],
      settings,
      cardId,
    };
  }

  const [row] = rows;
  const getDataPoint = (value: RowValue, index: number) => ({
    key: cols[index].display_name,
    value:
      index === dimensionIndex && feature != null
        ? getFeatureName(feature)
        : value,
    // We set clickBehaviorValue to the raw data value for use in a filter via crossfiltering.
    // `value` above is used in the tool tips so it needs to use `getFeatureName`
    clickBehaviorValue: value,
    col: cols[index],
  });
  const dimensions = [
    { value: row[dimensionIndex], column: cols[dimensionIndex] },
  ];

  if (rows.length === 1) {
    return {
      value: row[metricIndex],
      column: cols[metricIndex],
      dimensions,
      data: row.map(getDataPoint),
      origin: { row, cols },
      settings,
      cardId,
    };
  }

  // Multiple rows map to this feature (e.g. an extra breakout), so we sum the
  // metric and expose only the dimension and metric columns.
  const value = rows.reduce<RowValue>(
    (sum, row) => sumMetric(sum, row[metricIndex]),
    null,
  );
  return {
    value,
    column: cols[metricIndex],
    dimensions,
    data: [
      getDataPoint(row[dimensionIndex], dimensionIndex),
      getDataPoint(value, metricIndex),
    ],
    settings,
    cardId,
  };
}
