import { useState } from "react";

import type * as Lib from "metabase-lib";

import { AggregationList } from "./AggregationList";

type OffsetAggregationPickerProps = {
  query: Lib.Query;
  stageIndex: number;
  onSubmit: (query: Lib.Query) => void;
  onClose: () => void;
};

export function OffsetAggregationPicker({
  query,
  stageIndex,
}: OffsetAggregationPickerProps) {
  const [_, setAggregation] = useState<Lib.AggregationClause>();

  return (
    <AggregationList
      query={query}
      stageIndex={stageIndex}
      onChange={setAggregation}
    />
  );
}
