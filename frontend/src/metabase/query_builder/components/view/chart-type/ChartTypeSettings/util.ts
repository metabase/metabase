import _ from "underscore";

import { DEFAULT_ORDER } from "metabase/query_builder/components/view/chart-type/util";
import visualizations from "metabase/visualizations";
import { sanitizeResultData } from "metabase/visualizations/shared/utils/data";
import type Query from "metabase-lib/v1/queries/Query";
import type { CardDisplayType, Dataset } from "metabase-types/api";

const isSensibleVisualization = (
  result: Dataset,
  query: Query,
  vizType: CardDisplayType,
): boolean => {
  const visualization = visualizations.get(vizType);
  return (
    (result?.data &&
      visualization?.isSensible?.(sanitizeResultData(result.data), query)) ||
    false
  );
};

export const getSensibleVisualizations = ({
  result,
  query,
}: {
  result: Dataset;
  query: Query;
}): [CardDisplayType[], CardDisplayType[]] => {
  const availableVizTypes = Array.from(visualizations.entries())
    .filter(([_, config]) => !config.hidden)
    .map(([vizType]) => vizType);

  const orderedVizTypes = _.union(DEFAULT_ORDER, availableVizTypes);

  return _.partition(orderedVizTypes, vizType =>
    isSensibleVisualization(result, query, vizType),
  );
};
