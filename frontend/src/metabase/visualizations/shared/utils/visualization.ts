import _ from "underscore";
import visualizations from "metabase/visualizations";
import { SingleSeries } from "metabase-types/api";

import Query from "metabase-lib/queries/Query";

const DEFAULT_ORDER = [
  "table",
  "bar",
  "line",
  "pie",
  "scalar",
  "row",
  "area",
  "combo",
  "pivot",
  "smartscalar",
  "gauge",
  "progress",
  "funnel",
  "object",
  "map",
  "scatter",
  "waterfall",
];

export const groupVisualizations = (result: SingleSeries, query: Query) => {
  return _.partition(
    _.union(
      DEFAULT_ORDER,
      Array.from(visualizations)
        .filter(([_type, visualization]) => !visualization.hidden)
        .map(([vizType]) => vizType),
    ),
    vizType => {
      const visualization = visualizations.get(vizType);
      return (
        result &&
        result.data &&
        visualization.isSensible &&
        visualization.isSensible(result.data, query)
      );
    },
  );
};
