import { useState } from "react";

import { Box, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import { JoinConditionColumnPicker } from "../JoinConditionColumnPicker";
import { JoinConditionOperatorPicker } from "../JoinConditionOperatorPicker";

import { JoinConditionRoot } from "./JoinConditionDraft.styled";
import { getDefaultJoinConditionOperator } from "./utils";

interface JoinConditionDraftProps {
  query: Lib.Query;
  stageIndex: number;
  joinable: Lib.Joinable;
  isReadOnly: boolean;
  onChange: (newCondition: Lib.JoinCondition) => void;
  onLhsColumnChange: (newLhsColumn: Lib.ColumnMetadata) => void;
}

export function JoinConditionDraft({
  query,
  stageIndex,
  joinable,
  isReadOnly,
  onChange,
  onLhsColumnChange,
}: JoinConditionDraftProps) {
  const [operator, setOperator] = useState(() =>
    getDefaultJoinConditionOperator(query, stageIndex),
  );
  const [lhsColumn, setLhsColumn] = useState<Lib.ColumnMetadata>();
  const [rhsColumn, setRhsColumn] = useState<Lib.ColumnMetadata>();

  const handleColumnChange = (
    lhsColumn: Lib.ColumnMetadata | undefined,
    rhsColumn: Lib.ColumnMetadata | undefined,
  ) => {
    if (lhsColumn != null && rhsColumn != null) {
      const newCondition = Lib.joinConditionClause(
        query,
        stageIndex,
        operator,
        lhsColumn,
        rhsColumn,
      );
      onChange(newCondition);
    }
  };

  const handleLhsColumnChange = (newLhsColumn: Lib.ColumnMetadata) => {
    setLhsColumn(newLhsColumn);
    onLhsColumnChange(newLhsColumn);
    handleColumnChange(newLhsColumn, rhsColumn);
  };

  const handleRhsColumnChange = (newRhsColumn: Lib.ColumnMetadata) => {
    setRhsColumn(newRhsColumn);
    handleColumnChange(lhsColumn, newRhsColumn);
  };

  return (
    <JoinConditionRoot>
      <Flex align="center" gap="4px" mih="47px" p="4px">
        <Box ml={!lhsColumn ? "4px" : undefined}>
          <JoinConditionColumnPicker
            query={query}
            stageIndex={stageIndex}
            joinable={joinable}
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
          onChange={setOperator}
        />
        <Box mr={!rhsColumn ? "4px" : undefined}>
          <JoinConditionColumnPicker
            query={query}
            stageIndex={stageIndex}
            joinable={joinable}
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
