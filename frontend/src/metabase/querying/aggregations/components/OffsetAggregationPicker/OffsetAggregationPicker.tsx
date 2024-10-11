import { useMemo, useState } from "react";

import { Box, PopoverBackButton } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { OffsetAggregationForm } from "./OffsetAggregationForm";
import { OffsetAggregationList } from "./OffsetAggregationList";
import {
  getInitialAggregation,
  getSupportedAggregations,
  getTitle,
} from "./utils";

type OffsetAggregationPickerProps = {
  query: Lib.Query;
  stageIndex: number;
  initialAggregation?: Lib.AggregationClause;
  onSubmit: (query: Lib.Query, aggregations: Lib.ExpressionClause[]) => void;
  onClose: () => void;
};

export function OffsetAggregationPicker({
  query,
  stageIndex,
  initialAggregation,
  onSubmit,
  onClose,
}: OffsetAggregationPickerProps) {
  const aggregations = useMemo(
    () => getSupportedAggregations(query, stageIndex),
    [query, stageIndex],
  );
  const [aggregation, setAggregation] = useState(() =>
    getInitialAggregation(aggregations, initialAggregation),
  );

  const handleBackClick = () => {
    if (aggregation == null || aggregations.length <= 1 || initialAggregation) {
      onClose();
    } else {
      setAggregation(undefined);
    }
  };

  return (
    <Box p="lg">
      <PopoverBackButton mb="lg" onClick={handleBackClick}>
        {getTitle(query, stageIndex, aggregation)}
      </PopoverBackButton>
      {aggregation ? (
        <OffsetAggregationForm
          query={query}
          stageIndex={stageIndex}
          aggregation={aggregation}
          onSubmit={onSubmit}
        />
      ) : (
        <OffsetAggregationList
          query={query}
          stageIndex={stageIndex}
          aggregations={aggregations}
          onChange={setAggregation}
        />
      )}
    </Box>
  );
}
