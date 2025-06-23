import { useLayoutEffect, useState } from "react";

import { Box, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import { JoinConditionColumnPicker } from "../JoinConditionColumnPicker";
import { JoinConditionOperatorPicker } from "../JoinConditionOperatorPicker";
import { JoinConditionRemoveButton } from "../JoinConditionRemoveButton";
import { updateTemporalBucketing } from "../utils";

import S from "./JoinConditionDraft.module.css";
import { getDefaultJoinConditionOperator } from "./utils";

interface JoinConditionDraftProps {
  query: Lib.Query;
  stageIndex: number;
  joinable: Lib.JoinOrJoinable;
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
  const [isLhsOpened, setIsLhsOpened] = useState(true);
  const [isRhsOpened, setIsRhsOpened] = useState(false);

  const handleColumnChange = (
    newLhsExpression: Lib.ExpressionClause | undefined,
    newRhsExpression: Lib.ExpressionClause | undefined,
  ) => {
    if (newLhsExpression != null && newRhsExpression != null) {
      const newCondition = updateTemporalBucketing(
        query,
        stageIndex,
        Lib.joinConditionClause(
          query,
          stageIndex,
          operator,
          newLhsExpression,
          newRhsExpression,
        ),
        [newLhsExpression, newRhsExpression],
      );
      onChange(newCondition);
    }
  };

  const handleLhsExpressionChange = (
    newLhsExpression: Lib.ExpressionClause,
  ) => {
    setLhsExpression(newLhsExpression);
    setIsRhsOpened(true);
    onLhsExpressionChange?.(newLhsExpression);
    handleColumnChange(newLhsExpression, rhsExpression);
  };

  const handleRhsExpressionChange = (
    newRhsExpression: Lib.ExpressionClause,
  ) => {
    setRhsExpression(newRhsExpression);
    handleColumnChange(lhsExpression, newRhsExpression);
  };

  useLayoutEffect(() => {
    setLhsExpression(undefined);
    setRhsExpression(undefined);
    setIsLhsOpened(true);
    setIsRhsOpened(false);
  }, [rhsTable]);

  return (
    <Flex className={S.JoinConditionRoot}>
      <Flex align="center" gap="xs" mih="47px" p="xs">
        <Box ml={!lhsExpression ? "xs" : undefined}>
          <JoinConditionColumnPicker
            query={query}
            stageIndex={stageIndex}
            joinable={joinable}
            tableName={lhsTableName}
            lhsExpression={lhsExpression}
            rhsExpression={rhsExpression}
            isOpened={isLhsOpened}
            isLhsExpression={true}
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
        <Box mr={!rhsExpression ? "xs" : undefined}>
          <JoinConditionColumnPicker
            query={query}
            stageIndex={stageIndex}
            joinable={joinable}
            tableName={rhsTableName}
            lhsExpression={lhsExpression}
            rhsExpression={rhsExpression}
            isOpened={isRhsOpened}
            isLhsExpression={false}
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
