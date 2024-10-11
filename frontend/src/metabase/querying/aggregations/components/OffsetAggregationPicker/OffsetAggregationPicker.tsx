import { useMemo, useState } from "react";

import { Box, PopoverBackButton } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { OffsetAggregationForm } from "./OffsetAggregationForm";
import { OffsetAggregationList } from "./OffsetAggregationList";
import { getSupportedAggregations, getTitle } from "./utils";

type OffsetAggregationPickerProps = {
  query: Lib.Query;
  stageIndex: number;
  onSubmit: (query: Lib.Query, aggregations: Lib.ExpressionClause[]) => void;
  onClose: () => void;
};

export function OffsetAggregationPicker({
  query,
  stageIndex,
  onClose,
}: OffsetAggregationPickerProps) {
  const aggregations = useMemo(
    () => getSupportedAggregations(query, stageIndex),
    [query, stageIndex],
  );
  const [aggregation, setAggregation] = useState(
    aggregations.length === 1 ? aggregations[0] : undefined,
  );

  const handleBackClick = () => {
    if (aggregation == null || aggregations.length <= 1) {
      onClose();
    } else {
      setAggregation(undefined);
    }
  };

  return (
    <div>
      <Box p="md">
        <PopoverBackButton onClick={handleBackClick}>
          {getTitle(query, stageIndex, aggregation)}
        </PopoverBackButton>
        {aggregation ? (
          <OffsetAggregationForm query={query} stageIndex={stageIndex} />
        ) : (
          <OffsetAggregationList
            query={query}
            stageIndex={stageIndex}
            aggregations={aggregations}
            onChange={setAggregation}
          />
        )}
      </Box>
    </div>
  );
}
