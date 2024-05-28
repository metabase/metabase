import { useMemo, useState } from "react";

import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ExpressionWidgetHeader } from "../expressions/ExpressionWidgetHeader";

import { getTitle } from "./utils";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  onClose: () => void;
}

export const CompareAggregations = ({ query, stageIndex, onClose }: Props) => {
  const aggregations = useMemo(
    () => Lib.aggregations(query, stageIndex),
    [query, stageIndex],
  );
  const [aggregation, setAggregation] = useState(
    aggregations.length === 1 ? aggregations[0] : undefined,
  );

  const title = useMemo(
    () => getTitle(query, stageIndex, aggregation),
    [query, stageIndex, aggregation],
  );

  return (
    <Box data-testid="compare-aggregations">
      <ExpressionWidgetHeader title={title} onBack={onClose} />
    </Box>
  );
};
