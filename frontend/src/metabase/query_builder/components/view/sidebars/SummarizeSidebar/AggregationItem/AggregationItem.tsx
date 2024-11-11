import { useCallback, useState } from "react";

import { AggregationPicker } from "metabase/common/components/AggregationPicker";
import { Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import { AggregationName, RemoveIcon, Root } from "./AggregationItem.styled";

interface AggregationItemProps {
  query: Lib.Query;
  stageIndex: number;
  aggregation: Lib.AggregationClause;
  aggregationIndex: number;
  onQueryChange: (query: Lib.Query) => void;
}

export function AggregationItem({
  query,
  stageIndex,
  aggregation,
  aggregationIndex,
  onQueryChange,
}: AggregationItemProps) {
  const [isOpened, setIsOpened] = useState(false);
  const { displayName } = Lib.displayInfo(query, stageIndex, aggregation);

  const operators = Lib.selectedAggregationOperators(
    Lib.availableAggregationOperators(query, stageIndex),
    aggregation,
  );

  const handleRemove = useCallback(() => {
    const nextQuery = Lib.removeClause(query, stageIndex, aggregation);
    onQueryChange(nextQuery);
  }, [query, stageIndex, aggregation, onQueryChange]);

  return (
    <Popover opened={isOpened} onChange={setIsOpened}>
      <Popover.Target>
        <Root
          aria-label={displayName}
          data-testid="aggregation-item"
          onClick={() => setIsOpened(!isOpened)}
        >
          <AggregationName>{displayName}</AggregationName>
          <RemoveIcon name="close" onClick={handleRemove} />
        </Root>
      </Popover.Target>
      <Popover.Dropdown>
        <AggregationPicker
          query={query}
          stageIndex={stageIndex}
          clause={aggregation}
          clauseIndex={aggregationIndex}
          operators={operators}
          allowTemporalComparisons
          onQueryChange={onQueryChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
