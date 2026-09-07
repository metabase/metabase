import { useMemo } from "react";

import { Group, type GroupProps } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { UpdateQueryHookProps } from "../../../../../hooks/types";
import { getAggregationItems } from "../../../../../utils/get-aggregation-items";
import { AddAggregationButton } from "../AddAggregationButton";
import { AggregationItem } from "../AggregationItem";

type SummarizeAggregationItemListProps = UpdateQueryHookProps & GroupProps;

export const SummarizeAggregationItemList = ({
  query,
  onQueryChange,
  stageIndex,
  ...containerProps
}: SummarizeAggregationItemListProps) => {
  const aggregationItems = useMemo(
    () => getAggregationItems({ query, stageIndex }),
    [query, stageIndex],
  );

  const handleRemove = (aggregation: Lib.AggregationClause) => {
    const nextQuery = Lib.removeClause(query, stageIndex, aggregation);
    onQueryChange(nextQuery);
  };

  return (
    <Group
      data-testid="summarize-aggregation-item-list"
      gap="sm"
      align="flex-start"
      {...containerProps}
    >
      {aggregationItems.map(
        ({ aggregation, displayName, aggregationIndex, operators }) => (
          <AggregationItem
            key={aggregationIndex}
            query={query}
            stageIndex={stageIndex}
            aggregation={aggregation}
            aggregationIndex={aggregationIndex}
            onQueryChange={onQueryChange}
            displayName={displayName}
            onAggregationRemove={() => handleRemove(aggregation)}
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
