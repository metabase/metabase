import { useState } from "react";

import { Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import { AggregationPicker } from "../SummarizeSidebar.styled";

import { AggregationName, RemoveIcon, Root } from "./AggregationItem.styled";

interface AggregationItemProps {
  query: Lib.Query;
  stageIndex: number;
  aggregation: Lib.AggregationClause;
  aggregationIndex: number;
  onRemove: () => void;
  onQueryChange: (query: Lib.Query) => void;
}

export function AggregationItem({
  query,
  stageIndex,
  aggregation,
  aggregationIndex,
  onRemove,
  onQueryChange,
}: AggregationItemProps) {
  const [isOpened, setIsOpened] = useState(false);
  const { displayName } = Lib.displayInfo(query, stageIndex, aggregation);

  const operators = Lib.selectedAggregationOperators(
    Lib.availableAggregationOperators(query, stageIndex),
    aggregation,
  );

  return (
    <Popover opened={isOpened} onChange={setIsOpened}>
      <Popover.Target>
        <Root
          aria-label={displayName}
          data-testid="aggregation-item"
          onClick={() => setIsOpened(!isOpened)}
        >
          <AggregationName>{displayName}</AggregationName>
          <RemoveIcon name="close" onClick={onRemove} />
        </Root>
      </Popover.Target>
      <Popover.Dropdown>
        <AggregationPicker
          query={query}
          stageIndex={stageIndex}
          clause={aggregation}
          clauseIndex={aggregationIndex}
          operators={operators}
          hasExpressionInput={false}
          onQueryChange={onQueryChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
