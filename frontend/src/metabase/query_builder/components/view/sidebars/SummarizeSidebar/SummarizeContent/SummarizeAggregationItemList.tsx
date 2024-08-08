import { Group, type GroupProps } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { AddAggregationButton } from "../AddAggregationButton";
import { AggregationItem } from "../AggregationItem";

type SummarizeAggregationItemListProps = {
  query: Lib.Query;
  stageIndex: number;
  aggregations: Lib.AggregationClause[];
  onAddAggregations: (aggregations: Lib.Aggregable[]) => void;
  onUpdateAggregation: (
    aggregation: Lib.AggregationClause,
    nextAggregation: Lib.Aggregable,
  ) => void;
  onRemoveAggregation: (aggregation: Lib.AggregationClause) => void;
  onQueryChange: (query: Lib.Query) => void;
} & GroupProps;

export const SummarizeAggregationItemList = ({
  query,
  stageIndex,
  aggregations,
  onAddAggregations,
  onUpdateAggregation,
  onRemoveAggregation,
  onQueryChange,
  ...containerProps
}: SummarizeAggregationItemListProps) => (
  <Group
    data-testid="summarize-aggregation-item-list"
    spacing="sm"
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
        onUpdate={nextAggregation =>
          onUpdateAggregation(aggregation, nextAggregation)
        }
        onRemove={() => onRemoveAggregation(aggregation)}
      />
    ))}
    <AddAggregationButton
      query={query}
      stageIndex={stageIndex}
      onQueryChange={onQueryChange}
    />
  </Group>
);
