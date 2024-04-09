import { useState } from "react";

import { Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import { AggregationPicker } from "../SummarizeSidebar.styled";

import { AggregationName, RemoveIcon, Root } from "./AggregationItem.styled";

const STAGE_INDEX = -1;

interface AggregationItemProps {
  query: Lib.Query;
  aggregation: Lib.AggregationClause;
  onUpdate: (nextAggregation: Lib.Aggregable) => void;
  onRemove: () => void;
}

export function AggregationItem({
  query,
  aggregation,
  onUpdate,
  onRemove,
}: AggregationItemProps) {
  const [isOpened, setIsOpened] = useState(false);
  const { displayName } = Lib.displayInfo(query, STAGE_INDEX, aggregation);

  const operators = Lib.selectedAggregationOperators(
    Lib.availableAggregationOperators(query, STAGE_INDEX),
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
          stageIndex={STAGE_INDEX}
          clause={aggregation}
          operators={operators}
          hasExpressionInput={false}
          onSelect={nextAggregation => {
            onUpdate(nextAggregation);
            setIsOpened(false);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
