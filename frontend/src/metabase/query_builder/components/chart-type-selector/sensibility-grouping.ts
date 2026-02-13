import _ from "underscore";

import visualizations from "metabase/visualizations";
import {
  hasLatitudeAndLongitudeColumns,
  isCountry,
  isDate,
  isDimension,
  isLatitude,
  isLongitude,
  isMetric,
  isState,
} from "metabase-lib/v1/types/utils/isa";
import type { CardDisplayType, DatasetData } from "metabase-types/api";

const MAX_RECOMMENDED = 12;

export type VisualizationSensibility =
  | "recommended"
  | "sensible"
  | "nonsensible";

export type SensibilityGroups = Record<
  VisualizationSensibility,
  CardDisplayType[]
>;

export function groupVisualizationsBySensibility({
  orderedVizTypes,
  data,
}: {
  orderedVizTypes: CardDisplayType[];
  data: DatasetData;
}): SensibilityGroups {
  const groups: SensibilityGroups = {
    recommended: [],
    sensible: [],
    nonsensible: [],
  };

  for (const vizType of orderedVizTypes) {
    const viz = visualizations.get(vizType);
    if (viz?.isSensible?.(data)) {
      groups.sensible.push(vizType);
    } else {
      groups.nonsensible.push(vizType);
    }
  }

  const recommended = _.uniq(
    getRecommendedVisualizations(data, groups.sensible),
  ); //uniq just in case
  const sensibleRecommendations = recommended.filter((vizType) =>
    groups.sensible.includes(vizType),
  );
  groups.recommended = sensibleRecommendations;
  groups.sensible = groups.sensible.filter(
    (vizType) => !sensibleRecommendations.includes(vizType),
  );

  while (groups.recommended.length > MAX_RECOMMENDED) {
    const overflow = groups.recommended.pop()!;
    groups.sensible.unshift(overflow);
  }

  return groups;
}

function getRecommendedVisualizations(
  data: DatasetData,
  sensible: CardDisplayType[],
): CardDisplayType[] {
  const { cols, rows } = data;
  const metricCount = cols.filter(isMetric).length;
  const dimensionCount = cols.filter(isDimension).length;
  const hasGeo =
    hasLatitudeAndLongitudeColumns(cols) ||
    cols.some(isCountry) ||
    cols.some(isState);
  const nonLatLongDimensionCount = cols.filter(
    (col) => isDimension(col) && !isLatitude(col) && !isLongitude(col),
  ).length;
  const hasDateDimension = cols.some((col) => isDimension(col) && isDate(col));

  if (rows.length === 1 && cols.length === 1 && metricCount === 1) {
    return ["scalar", "gauge", "progress"];
  }
  if (rows.length === 1 && cols.length === 1 && metricCount === 0) {
    return ["table", "object", "scalar"];
  }
  if (
    rows.length === 1 &&
    cols.length > 1 &&
    (metricCount === 0 || dimensionCount === 0)
  ) {
    return ["table", "object"];
  }
  if (cols.length <= 1) {
    return ["table"];
  }
  if (metricCount === 0) {
    return ["table", "pivot"];
  }
  // recommended visualizations for unaggregated tables
  // for a native query, we don't know if there are aggregations, but we assume that there are
  // that means we may recommend an e.g. line chart even if the native query is just `select * from tbl`
  // but that's better than not recommending a relevant viz for a native query like `select c1, sum(c2) from tbl`
  if (
    !cols.some((col) => col.source === "aggregation" || col.source === "native")
  ) {
    return ["table", "object", "map", "scatter"];
  }
  const recommended: CardDisplayType[] = [];
  if (hasGeo) {
    recommended.push("map");
    // table, pivot, and scatter are also recommended for geo
    // but we'll add them below, because order is important
    // if we also have a date dimension, we want e.g. line to come before them
  }
  if (hasDateDimension) {
    recommended.push(
      "line",
      "area",
      "bar",
      "combo",
      "smartscalar",
      "row",
      "waterfall",
      "scatter",
      "pie",
      "table",
      "pivot",
    );
  } else if (nonLatLongDimensionCount > 0) {
    recommended.push(
      "bar",
      "row",
      "pie",
      "line",
      "area",
      "combo",
      "waterfall",
      "scatter",
      "table",
      "pivot",
    );
  } else if (hasGeo) {
    recommended.push("table", "pivot", "scatter");
  }
  if (sensible.includes("sankey")) {
    // the sankey sensibility check is quite robust, so we recommend it whenever it's sensible
    recommended.push("sankey");
  }
  return recommended;
}
