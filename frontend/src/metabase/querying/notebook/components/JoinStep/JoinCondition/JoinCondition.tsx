import { useMemo, useState } from "react";

import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import { JoinConditionColumnPicker } from "../JoinConditionColumnPicker";
import { JoinConditionOperatorPicker } from "../JoinConditionOperatorPicker";
import { JoinConditionRemoveButton } from "../JoinConditionRemoveButton";

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

  const strategy = useMemo(() => Lib.joinStrategy(join), [join]);
  const { operator, lhsExpression, rhsExpression } = useMemo(
    () => Lib.joinConditionParts(condition),
    [condition],
  );

  const createCondition = (
    operator: Lib.JoinConditionOperator,
    lhsExpression: Lib.ExpressionClause,
    rhsExpression: Lib.ExpressionClause,
  ) => Lib.joinConditionClause(operator, lhsExpression, rhsExpression);

  const syncTemporalBucket = (
    condition: Lib.JoinCondition,
    temporalBucket: Lib.Bucket | null,
  ) =>
    Lib.joinConditionUpdateTemporalBucketing(
      query,
      stageIndex,
      condition,
      temporalBucket,
    );

  const handleOperatorChange = (newOperator: Lib.JoinConditionOperator) => {
    const newCondition = createCondition(
      newOperator,
      lhsExpression,
      rhsExpression,
    );
    onChange(newCondition);
  };

  const handleLhsExpressionChange = (
    newLhsExpression: Lib.ExpressionClause,
    newLhsTemporalBucket: Lib.Bucket | null,
  ) => {
    const newCondition = createCondition(
      operator,
      newLhsExpression,
      rhsExpression,
    );
    onChange(syncTemporalBucket(newCondition, newLhsTemporalBucket));
  };

  const handleRhsExpressionChange = (
    newRhsExpression: Lib.ExpressionClause,
    newRhsTemporalBucket: Lib.Bucket | null,
  ) => {
    const newCondition = createCondition(
      operator,
      lhsExpression,
      newRhsExpression,
    );
    onChange(syncTemporalBucket(newCondition, newRhsTemporalBucket));
  };

  return (
    <Flex className={S.JoinConditionRoot}>
      <Flex align="center" gap="xs" mih="47px" p="xs">
        <JoinConditionColumnPicker
          query={query}
          stageIndex={stageIndex}
          joinable={join}
          strategy={strategy}
          tableName={lhsTableName}
          lhsExpression={lhsExpression}
          rhsExpression={rhsExpression}
          isOpened={isLhsOpened}
          isLhsPicker={true}
          isReadOnly={isReadOnly}
          onChange={handleLhsExpressionChange}
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
          strategy={strategy}
          tableName={rhsTableName}
          lhsExpression={lhsExpression}
          rhsExpression={rhsExpression}
          isOpened={isRhsOpened}
          isLhsPicker={false}
          isReadOnly={isReadOnly}
          onChange={handleRhsExpressionChange}
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
