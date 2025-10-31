import { useLayoutEffect, useState } from "react";

import { Box, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import { JoinConditionColumnPicker } from "../JoinConditionColumnPicker";
import { JoinConditionOperatorPicker } from "../JoinConditionOperatorPicker";
import { JoinConditionRemoveButton } from "../JoinConditionRemoveButton";

import S from "./JoinConditionDraft.module.css";
import { getDefaultJoinConditionOperator } from "./utils";

interface JoinConditionDraftProps {
  query: Lib.Query;
  stageIndex: number;
  joinable: Lib.JoinOrJoinable;
  strategy: Lib.JoinStrategy;
  lhsTableName: string;
  rhsTable?: Lib.Joinable;
  rhsTableName: string | undefined;
  isReadOnly: boolean;
  isRemovable: boolean;
  onChange: (newCondition: Lib.JoinCondition) => void;
  onRemove?: () => void;
  onLhsExpressionChange?: (newLhsExpression: Lib.ExpressionClause) => void;
}

export function JoinConditionDraft({
  query,
  stageIndex,
  joinable,
  strategy,
  lhsTableName,
  rhsTable,
  rhsTableName,
  isReadOnly,
  isRemovable,
  onChange,
  onRemove,
  onLhsExpressionChange,
}: JoinConditionDraftProps) {
  const [operator, setOperator] = useState(() =>
    getDefaultJoinConditionOperator(query, stageIndex),
  );
  const [lhsExpression, setLhsExpression] = useState<Lib.ExpressionClause>();
  const [rhsExpression, setRhsExpression] = useState<Lib.ExpressionClause>();
  const [lhsTemporalBucket, setLhsTemporalBucket] = useState<Lib.Bucket | null>(
    null,
  );
  const [rhsTemporalBucket, setRhsTemporalBucket] = useState<Lib.Bucket | null>(
    null,
  );
  const [isLhsOpened, setIsLhsOpened] = useState(true);
  const [isRhsOpened, setIsRhsOpened] = useState(false);

  const handleColumnChange = (
    lhsExpression: Lib.ExpressionClause | undefined,
    rhsExpression: Lib.ExpressionClause | undefined,
    lhsTemporalBucket: Lib.Bucket | null,
    rhsTemporalBucket: Lib.Bucket | null,
  ) => {
    if (lhsExpression != null && rhsExpression != null) {
      const newCondition = Lib.joinConditionUpdateTemporalBucketing(
        query,
        stageIndex,
        Lib.joinConditionClause(operator, lhsExpression, rhsExpression),
        lhsTemporalBucket ?? rhsTemporalBucket,
      );
      onChange(newCondition);
    }
  };

  const handleLhsExpressionChange = (
    newLhsExpression: Lib.ExpressionClause,
    newLhsTemporalBucket: Lib.Bucket | null,
  ) => {
    setLhsExpression(newLhsExpression);
    setLhsTemporalBucket(newLhsTemporalBucket);
    setIsRhsOpened(true);
    onLhsExpressionChange?.(newLhsExpression);
    handleColumnChange(
      newLhsExpression,
      rhsExpression,
      newLhsTemporalBucket,
      rhsTemporalBucket,
    );
  };

  const handleRhsExpressionChange = (
    newRhsExpression: Lib.ExpressionClause,
    newRhsTemporalBucket: Lib.Bucket | null,
  ) => {
    setRhsExpression(newRhsExpression);
    setRhsTemporalBucket(newRhsTemporalBucket);
    handleColumnChange(
      lhsExpression,
      newRhsExpression,
      lhsTemporalBucket,
      newRhsTemporalBucket,
    );
  };

  useLayoutEffect(() => {
    setLhsExpression(undefined);
    setRhsExpression(undefined);
    setIsLhsOpened(true);
    setIsRhsOpened(false);
  }, [rhsTable]);

  return (
    <Flex className={S.JoinConditionRoot}>
      <Flex align="center" gap="xs" p="sm">
        <Box>
          <JoinConditionColumnPicker
            query={query}
            stageIndex={stageIndex}
            joinable={joinable}
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
        </Box>
        <JoinConditionOperatorPicker
          query={query}
          stageIndex={stageIndex}
          operator={operator}
          isReadOnly={isReadOnly}
          isConditionComplete={false}
          onChange={setOperator}
        />
        <Box>
          <JoinConditionColumnPicker
            query={query}
            stageIndex={stageIndex}
            joinable={joinable}
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
        </Box>
      </Flex>
      {!isReadOnly && isRemovable && (
        <JoinConditionRemoveButton
          isConditionComplete={false}
          onClick={onRemove}
        />
      )}
    </Flex>
  );
}
