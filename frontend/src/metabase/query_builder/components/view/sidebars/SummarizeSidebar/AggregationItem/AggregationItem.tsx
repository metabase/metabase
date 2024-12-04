import { useDisclosure } from "@mantine/hooks";

import { AggregationPicker } from "metabase/common/components/AggregationPicker";
import { Popover } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { AggregationName, RemoveIcon, Root } from "./AggregationItem.styled";

interface AggregationItemProps {
  query: Lib.Query;
  onQueryChange: (query: Lib.Query) => void;
  stageIndex: number;
  aggregation: Lib.AggregationClause;
  aggregationIndex: number;
  displayName: string;
  onAggregationRemove: () => void;
  operators: Lib.AggregationOperator[];
}

export function AggregationItem({
  query,
  stageIndex,
  aggregation,
  aggregationIndex,
  onQueryChange,
  displayName,
  onAggregationRemove,
  operators,
}: AggregationItemProps) {
  const [isOpened, { toggle }] = useDisclosure(false);

  return (
    <Popover opened={isOpened} onChange={toggle}>
      <Popover.Target>
        <Root
          aria-label={displayName}
          data-testid="aggregation-item"
          onClick={toggle}
        >
          <AggregationName>{displayName}</AggregationName>
          <RemoveIcon name="close" onClick={onAggregationRemove} />
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
