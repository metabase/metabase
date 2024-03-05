import { useMemo } from "react";

import { Box, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import { JoinConditionColumnPicker } from "../JoinConditionColumnPicker";
import { JoinConditionOperatorPicker } from "../JoinConditionOperatorPicker";

import { JoinConditionRoot } from "./JoinCondition.styled";

interface JoinConditionProps {
  query: Lib.Query;
  stageIndex: number;
  join: Lib.Join;
  condition: Lib.JoinCondition;
  isReadOnly: boolean;
  onChange: (condition: Lib.JoinCondition) => void;
}

export function JoinCondition({
  query,
  stageIndex,
  join,
  condition,
  isReadOnly,
  onChange,
}: JoinConditionProps) {
  const { operator, lhsColumn, rhsColumn } = useMemo(
    () => Lib.joinConditionParts(query, stageIndex, condition),
    [query, stageIndex, condition],
  );

  const handleOperatorChange = (newOperator: Lib.JoinConditionOperator) => {
    const newCondition = Lib.joinConditionClause(
      query,
      stageIndex,
      newOperator,
      lhsColumn,
      rhsColumn,
    );
    onChange(newCondition);
  };

  const handleLhsColumnChange = (newLhsColumn: Lib.ColumnMetadata) => {
    const newCondition = Lib.joinConditionClause(
      query,
      stageIndex,
      operator,
      newLhsColumn,
      rhsColumn,
    );
    onChange(newCondition);
  };

  const handleRhsColumnChange = (newRhsColumn: Lib.ColumnMetadata) => {
    const newCondition = Lib.joinConditionClause(
      query,
      stageIndex,
      operator,
      lhsColumn,
      newRhsColumn,
    );
    onChange(newCondition);
  };

  return (
    <JoinConditionRoot>
      <Flex align="center" gap="4px" mih="47px" p="4px">
        <Box ml={!lhsColumn ? "4px" : undefined}>
          <JoinConditionColumnPicker
            query={query}
            stageIndex={stageIndex}
            joinable={join}
            lhsColumn={lhsColumn}
            rhsColumn={rhsColumn}
            isLhsColumn={true}
            isReadOnly={isReadOnly}
            onChange={handleLhsColumnChange}
          />
        </Box>
        <JoinConditionOperatorPicker
          query={query}
          stageIndex={stageIndex}
          operator={operator}
          isReadOnly={isReadOnly}
          onChange={handleOperatorChange}
        />
        <Box mr={!rhsColumn ? "4px" : undefined}>
          <JoinConditionColumnPicker
            query={query}
            stageIndex={stageIndex}
            joinable={join}
            lhsColumn={lhsColumn}
            rhsColumn={rhsColumn}
            isLhsColumn={false}
            isReadOnly={isReadOnly}
            onChange={handleRhsColumnChange}
          />
        </Box>
      </Flex>
    </JoinConditionRoot>
  );
}
