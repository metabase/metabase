import type { UpdateQueryHookProps } from "metabase/query_builder/hooks/types";
import { useQueryAggregations } from "metabase/query_builder/hooks/use-query-aggregations";
import { Group, type GroupProps } from "metabase/ui";

import { AddAggregationButton } from "../AddAggregationButton";
import { AggregationItem } from "../AggregationItem";

type SummarizeAggregationItemListProps = UpdateQueryHookProps & GroupProps;

export const SummarizeAggregationItemList = ({
  query,
  onQueryChange,
  ...containerProps
}: SummarizeAggregationItemListProps) => {
  const { aggregationData, stageIndex } = useQueryAggregations({
    query,
    onQueryChange,
  });

  return (
    <Group
      data-testid="summarize-aggregation-item-list"
      spacing="sm"
      align="flex-start"
      {...containerProps}
    >
      {aggregationData.map(
        ({
          aggregation,
          displayName,
          aggregationIndex,
          operators,
          handleRemove,
        }) => (
          <AggregationItem
            key={aggregationIndex}
            query={query}
            stageIndex={stageIndex}
            aggregation={aggregation}
            aggregationIndex={aggregationIndex}
            onQueryChange={onQueryChange}
            displayName={displayName}
            handleRemove={handleRemove}
            operators={operators}
          />
        ),
      )}
      <AddAggregationButton
        query={query}
        stageIndex={stageIndex}
        onQueryChange={onQueryChange}
      />
    </Group>
  );
};
