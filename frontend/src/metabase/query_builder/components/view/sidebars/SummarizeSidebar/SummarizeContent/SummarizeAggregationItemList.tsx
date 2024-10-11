import { Group, type GroupProps } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { AddAggregationButton } from "../AddAggregationButton";
import { AggregationItem } from "../AggregationItem";

type SummarizeAggregationItemListProps = {
  query: Lib.Query;
  stageIndex: number;
  aggregations: Lib.AggregationClause[];
  onQueryChange: (query: Lib.Query) => void;
} & GroupProps;

export const SummarizeAggregationItemList = ({
  query,
  stageIndex,
  aggregations,
  onQueryChange,
  ...containerProps
}: SummarizeAggregationItemListProps) => (
  <Group
    data-testid="summarize-aggregation-item-list"
    gap="sm"
    align="flex-start"
    {...containerProps}
  >
    {aggregations.map((aggregation, aggregationIndex) => (
      <AggregationItem
        key={aggregationIndex}
        query={query}
        stageIndex={stageIndex}
        aggregation={aggregation}
        aggregationIndex={aggregationIndex}
        onQueryChange={onQueryChange}
      />
    ))}
    <AddAggregationButton
      query={query}
      stageIndex={stageIndex}
      onQueryChange={onQueryChange}
    />
  </Group>
);
