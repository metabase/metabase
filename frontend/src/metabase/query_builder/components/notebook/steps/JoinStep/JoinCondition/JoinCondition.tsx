import { useMemo, useState } from "react";

import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import { JoinConditionColumnPicker } from "../JoinConditionColumnPicker";
import { JoinConditionOperatorPicker } from "../JoinConditionOperatorPicker";
import { JoinConditionRemoveButton } from "../JoinConditionRemoveButton";
import { updateTemporalBucketing } from "../utils";

import { JoinConditionRoot } from "./JoinCondition.styled";

interface JoinConditionProps {
  query: Lib.Query;
  stageIndex: number;
  join: Lib.Join;
  condition: Lib.JoinCondition;
  lhsTableName: string;
  rhsTableName: string;
  isReadOnly: boolean;
  isRemovable: boolean;
  onChange: (newCondition: Lib.JoinCondition) => void;
  onRemove: () => void;
}

export function JoinCondition({
  query,
  stageIndex,
  join,
  condition,
  lhsTableName,
  rhsTableName,
  isReadOnly,
  isRemovable,
  onChange,
  onRemove,
}: JoinConditionProps) {
  const [isLhsOpened, setIsLhsOpened] = useState(false);
  const [isRhsOpened, setIsRhsOpened] = useState(false);

  const { operator, lhsColumn, rhsColumn } = useMemo(
    () => Lib.joinConditionParts(query, stageIndex, condition),
    [query, stageIndex, condition],
  );

  const createCondition = (
    operator: Lib.JoinConditionOperator,
    lhsColumn: Lib.ColumnMetadata,
    rhsColumn: Lib.ColumnMetadata,
  ) =>
    Lib.joinConditionClause(query, stageIndex, operator, lhsColumn, rhsColumn);

  const syncTemporalBucket = (
    condition: Lib.JoinCondition,
    newColumn: Lib.ColumnMetadata,
  ) => updateTemporalBucketing(query, stageIndex, condition, [newColumn]);

  const handleOperatorChange = (newOperator: Lib.JoinConditionOperator) => {
    const newCondition = createCondition(newOperator, lhsColumn, rhsColumn);
    onChange(newCondition);
  };

  const handleLhsColumnChange = (newLhsColumn: Lib.ColumnMetadata) => {
    const newCondition = createCondition(operator, newLhsColumn, rhsColumn);
    onChange(syncTemporalBucket(newCondition, newLhsColumn));
  };

  const handleRhsColumnChange = (newRhsColumn: Lib.ColumnMetadata) => {
    const newCondition = createCondition(operator, lhsColumn, newRhsColumn);
    onChange(syncTemporalBucket(newCondition, newRhsColumn));
  };

  return (
    <JoinConditionRoot>
      <Flex align="center" gap="xs" mih="47px" p="xs">
        <JoinConditionColumnPicker
          query={query}
          stageIndex={stageIndex}
          joinable={join}
          tableName={lhsTableName}
          lhsColumn={lhsColumn}
          rhsColumn={rhsColumn}
          isOpened={isLhsOpened}
          isLhsColumn={true}
          isReadOnly={isReadOnly}
          onChange={handleLhsColumnChange}
          onOpenChange={setIsLhsOpened}
        />
        <JoinConditionOperatorPicker
          query={query}
          stageIndex={stageIndex}
          operator={operator}
          isReadOnly={isReadOnly}
          isConditionComplete={true}
          onChange={handleOperatorChange}
        />
        <JoinConditionColumnPicker
          query={query}
          stageIndex={stageIndex}
          joinable={join}
          tableName={rhsTableName}
          lhsColumn={lhsColumn}
          rhsColumn={rhsColumn}
          isOpened={isRhsOpened}
          isLhsColumn={false}
          isReadOnly={isReadOnly}
          onChange={handleRhsColumnChange}
          onOpenChange={setIsRhsOpened}
        />
      </Flex>
      {!isReadOnly && isRemovable && (
        <JoinConditionRemoveButton
          isConditionComplete={true}
          onClick={onRemove}
        />
      )}
    </JoinConditionRoot>
  );
}
