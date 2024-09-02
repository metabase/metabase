import _ from "underscore";

import { DEFAULT_ORDER } from "metabase/query_builder/components/view/chart-type/util";
import visualizations from "metabase/visualizations";
import { sanitizeResultData } from "metabase/visualizations/shared/utils/data";
import type { Query } from "metabase-lib";
import type { CardDisplayType, Dataset } from "metabase-types/api";

type IsSensibleVisualizationProps = {
  result: Dataset | null;
  query?: Query;
  vizType: CardDisplayType;
};

const isSensibleVisualization = ({
  result,
  query,
  vizType,
}: IsSensibleVisualizationProps): boolean => {
  const visualization = visualizations.get(vizType);
  return (
    (result?.data &&
      visualization?.isSensible?.(sanitizeResultData(result.data), query)) ||
    false
  );
};

export type GetSensibleVisualizationsProps = Omit<
  IsSensibleVisualizationProps,
  "vizType"
>;

export const getSensibleVisualizations = ({
  result,
  query,
}: GetSensibleVisualizationsProps): [CardDisplayType[], CardDisplayType[]] => {
  const availableVizTypes = Array.from(visualizations.entries())
    .filter(([_, config]) => !config.hidden)
    .map(([vizType]) => vizType);

  const orderedVizTypes = _.union(DEFAULT_ORDER, availableVizTypes);

  return _.partition(orderedVizTypes, vizType =>
    isSensibleVisualization({ result, query, vizType }),
  );
};
