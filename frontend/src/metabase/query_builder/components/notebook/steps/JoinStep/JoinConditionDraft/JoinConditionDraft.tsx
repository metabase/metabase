import { Box, Flex } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { JoinConditionColumnPicker } from "../JoinConditionColumnPicker";
import { JoinConditionOperatorPicker } from "../JoinConditionOperatorPicker";

import { JoinConditionRoot } from "./JoinConditionDraft.styled";

interface JoinConditionDraftProps {
  query: Lib.Query;
  stageIndex: number;
  joinable: Lib.Joinable;
  operator: Lib.JoinConditionOperator;
  lhsColumn: Lib.ColumnMetadata | undefined;
  rhsColumn: Lib.ColumnMetadata | undefined;
  isReadOnly: boolean;
  onOperatorChange: (operator: Lib.JoinConditionOperator) => void;
  onLhsColumnChange: (lhsColumn: Lib.ColumnMetadata) => void;
  onRhsColumnChange: (lhsColumn: Lib.ColumnMetadata) => void;
}

export function JoinConditionDraft({
  query,
  stageIndex,
  joinable,
  operator,
  lhsColumn,
  rhsColumn,
  isReadOnly,
  onOperatorChange,
  onLhsColumnChange,
  onRhsColumnChange,
}: JoinConditionDraftProps) {
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
            onChange={onLhsColumnChange}
          />
        </Box>
        <JoinConditionOperatorPicker
          query={query}
          stageIndex={stageIndex}
          operator={operator}
          isReadOnly={isReadOnly}
          onChange={onOperatorChange}
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
            onChange={onRhsColumnChange}
          />
        </Box>
      </Flex>
    </JoinConditionRoot>
  );
}
