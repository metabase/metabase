import { Popover } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { JoinColumnButton } from "./JoinColumnButton";
import { JoinColumnDropdown } from "./JoinColumnDropdown";

interface JoinConditionColumnPickerProps {
  query: Lib.Query;
  stageIndex: number;
  joinable: Lib.JoinOrJoinable;
  strategy: Lib.JoinStrategy;
  tableName: string | undefined;
  lhsExpression: Lib.ExpressionClause | undefined;
  rhsExpression: Lib.ExpressionClause | undefined;
  isOpened: boolean;
  isLhsPicker: boolean;
  isReadOnly: boolean;
  onChange: (
    newExpression: Lib.ExpressionClause,
    newTemporalBucket: Lib.Bucket | null,
  ) => void;
  onOpenChange: (isOpened: boolean) => void;
}

export function JoinConditionColumnPicker({
  query,
  stageIndex,
  joinable,
  strategy,
  tableName,
  lhsExpression,
  rhsExpression,
  isOpened,
  isLhsPicker,
  isReadOnly,
  onChange,
  onOpenChange,
}: JoinConditionColumnPickerProps) {
  return (
    <Popover opened={isOpened} position="bottom-start" onChange={onOpenChange}>
      <Popover.Target>
        <JoinColumnButton
          query={query}
          stageIndex={stageIndex}
          tableName={tableName}
          lhsExpression={lhsExpression}
          rhsExpression={rhsExpression}
          isLhsPicker={isLhsPicker}
          isOpened={isOpened}
          isReadOnly={isReadOnly}
          onClick={() => onOpenChange(!isOpened)}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <JoinColumnDropdown
          query={query}
          stageIndex={stageIndex}
          joinable={joinable}
          strategy={strategy}
          lhsExpression={lhsExpression}
          rhsExpression={rhsExpression}
          isLhsPicker={isLhsPicker}
          onChange={onChange}
          onClose={() => onOpenChange(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
