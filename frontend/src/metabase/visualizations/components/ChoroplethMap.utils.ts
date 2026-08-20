import type { Feature } from "geojson";

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
  cardId: CardId;
};

export function buildFeatureClickObject(
  row: RowValue[] | undefined,
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
  if (row == null) {
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

  return {
    value: row[metricIndex],
    column: cols[metricIndex],
    dimensions: [
      {
        value: row[dimensionIndex],
        column: cols[dimensionIndex],
      },
    ],
    data: row.map((value, index) => ({
      key: cols[index].display_name,
      value:
        index === dimensionIndex && feature != null
          ? getFeatureName(feature)
          : value,
      // We set clickBehaviorValue to the raw data value for use in a filter via crossfiltering.
      // `value` above is used in the tool tips so it needs to use `getFeatureName`
      clickBehaviorValue: value,
      col: cols[index],
    })),
    origin: { row, cols },
    settings,
    cardId,
  };
}
