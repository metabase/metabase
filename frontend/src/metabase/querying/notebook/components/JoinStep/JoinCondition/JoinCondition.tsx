import { useMemo, useState } from "react";

import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import { JoinConditionColumnPicker } from "../JoinConditionColumnPicker";
import { JoinConditionOperatorPicker } from "../JoinConditionOperatorPicker";
import { JoinConditionRemoveButton } from "../JoinConditionRemoveButton";
import { updateTemporalBucketing } from "../utils";

import S from "./JoinCondition.module.css";

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

  const { operator, lhsExpression, rhsExpression } = useMemo(
    () => Lib.joinConditionParts(query, stageIndex, condition),
    [query, stageIndex, condition],
  );

  const createCondition = (
    newOperator: Lib.JoinConditionOperator,
    newLhsExpression: Lib.ExpressionClause,
    newRhsExpression: Lib.ExpressionClause,
  ) =>
    Lib.joinConditionClause(
      query,
      stageIndex,
      newOperator,
      newLhsExpression,
      newRhsExpression,
    );

  const syncTemporalBucket = (
    newCondition: Lib.JoinCondition,
    newExpression: Lib.ExpressionClause,
  ) =>
    updateTemporalBucketing(query, stageIndex, newCondition, [newExpression]);

  const handleOperatorChange = (newOperator: Lib.JoinConditionOperator) => {
    const newCondition = createCondition(
      newOperator,
      lhsExpression,
      rhsExpression,
    );
    onChange(newCondition);
  };

  const handleLhsColumnChange = (newLhsExpression: Lib.ExpressionClause) => {
    const newCondition = createCondition(
      operator,
      newLhsExpression,
      rhsExpression,
    );
    onChange(syncTemporalBucket(newCondition, newLhsExpression));
  };

  const handleRhsColumnChange = (newRhsExpression: Lib.ExpressionClause) => {
    const newCondition = createCondition(
      operator,
      lhsExpression,
      newRhsExpression,
    );
    onChange(syncTemporalBucket(newCondition, newRhsExpression));
  };

  return (
    <Flex className={S.JoinConditionRoot}>
      <Flex align="center" gap="xs" mih="47px" p="xs">
        <JoinConditionColumnPicker
          query={query}
          stageIndex={stageIndex}
          joinable={join}
          tableName={lhsTableName}
          lhsExpression={lhsExpression}
          rhsExpression={rhsExpression}
          isOpened={isLhsOpened}
          isLhsExpression={true}
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
          lhsExpression={lhsExpression}
          rhsExpression={rhsExpression}
          isOpened={isRhsOpened}
          isLhsExpression={false}
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
    </Flex>
  );
}
