import { useDisclosure } from "@mantine/hooks";

import { AggregationPicker } from "metabase/common/components/AggregationPicker";
import { Icon, Popover, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";

import AggregationItemS from "./AggregationItem.module.css";

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
        <button
          className={AggregationItemS.Root}
          aria-label={displayName}
          data-testid="aggregation-item"
          onClick={toggle}
        >
          <Text component="span" className={AggregationItemS.AggregationName}>
            {displayName}
          </Text>
          <Icon
            className={AggregationItemS.RemoveIcon}
            name="close"
            onClick={onAggregationRemove}
          />
        </button>
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
