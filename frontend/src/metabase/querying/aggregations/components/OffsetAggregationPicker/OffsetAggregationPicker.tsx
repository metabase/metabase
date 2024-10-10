import { useState } from "react";

import { Box, PopoverBackButton } from "metabase/ui";
import * as Lib from "metabase-lib";

import { OffsetAggregationForm } from "./OffsetAggregationForm";
import { OffsetAggregationList } from "./OffsetAggregationList";
import { getTitle } from "./utils";

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
  const aggregations = Lib.aggregations(query, stageIndex);
  const hasOneAggregation = aggregations.length === 1;
  const [aggregation, setAggregation] = useState(
    hasOneAggregation ? aggregations[0] : undefined,
  );

  const handleBackClick = () => {
    if (hasOneAggregation) {
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
          <OffsetAggregationForm />
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
