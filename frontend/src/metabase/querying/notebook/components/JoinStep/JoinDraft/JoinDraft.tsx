import { useLayoutEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import type { ColorName } from "metabase/lib/colors/types";
import { Flex, Text, rem } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NotebookCell, NotebookCellItem } from "../../NotebookCell";
import { JoinConditionDraft } from "../JoinConditionDraft";
import { JoinStrategyPicker } from "../JoinStrategyPicker";
import { JoinTableColumnDraftPicker } from "../JoinTableColumnDraftPicker";
import { JoinTablePicker } from "../JoinTablePicker";

import S from "./JoinDraft.module.css";
import { getDefaultJoinStrategy, getJoinFields } from "./utils";

interface JoinDraftProps {
  query: Lib.Query;
  stageIndex: number;
  color: ColorName;
  initialStrategy?: Lib.JoinStrategy;
  initialRhsTable?: Lib.Joinable;
  isReadOnly: boolean;
  onJoinChange: (join: Lib.Join) => void;
}

export function JoinDraft({
  query,
  stageIndex,
  color,
  initialStrategy,
  initialRhsTable,
  isReadOnly,
  onJoinChange,
}: JoinDraftProps) {
  const sourceTableId = Lib.sourceTableOrCardId(query);
  const [strategy, setStrategy] = useState(
    () => initialStrategy ?? getDefaultJoinStrategy(query, stageIndex),
  );
  const [rhsTable, setRhsTable] = useState(initialRhsTable);
  const [rhsTableColumns, setRhsTableColumns] = useState(() =>
    initialRhsTable
      ? Lib.joinableColumns(query, stageIndex, initialRhsTable)
      : [],
  );
  const [selectedRhsTableColumns, setSelectedRhsTableColumns] =
    useState(rhsTableColumns);
  const [lhsExpression, setLhsExpression] = useState<Lib.ExpressionClause>();

  const lhsTableName = useMemo(
    () => Lib.joinLHSDisplayName(query, stageIndex, rhsTable, lhsExpression),
    [query, stageIndex, rhsTable, lhsExpression],
  );

  const rhsTableName = useMemo(
    () =>
      rhsTable
        ? Lib.displayInfo(query, stageIndex, rhsTable).displayName
        : undefined,
    [query, stageIndex, rhsTable],
  );

  const handleTableChange = (newTable: Lib.Joinable) => {
    const newConditions = Lib.suggestedJoinConditions(
      query,
      stageIndex,
      newTable,
    );
    if (newConditions.length > 0) {
      const newJoin = Lib.joinClause(newTable, newConditions, strategy);
      onJoinChange(newJoin);
    } else {
      const newColumns = Lib.joinableColumns(query, stageIndex, newTable);
      setRhsTable(newTable);
      setRhsTableColumns(newColumns);
      setSelectedRhsTableColumns(newColumns);
    }
  };

  const handleConditionChange = (newCondition: Lib.JoinCondition) => {
    if (rhsTable) {
      const newJoin = Lib.withJoinFields(
        Lib.joinClause(rhsTable, [newCondition], strategy),
        getJoinFields(rhsTableColumns, selectedRhsTableColumns),
      );
      onJoinChange(newJoin);
    }
  };

  const handleReset = () => {
    const rhsTableColumns = initialRhsTable
      ? Lib.joinableColumns(query, stageIndex, initialRhsTable)
      : [];
    setStrategy(initialStrategy ?? getDefaultJoinStrategy(query, stageIndex));
    setRhsTable(initialRhsTable);
    setRhsTableColumns(rhsTableColumns);
    setSelectedRhsTableColumns(rhsTableColumns);
    setLhsExpression(undefined);
  };

  const handleResetRef = useLatest(handleReset);
  useLayoutEffect(
    () => handleResetRef.current(),
    [sourceTableId, handleResetRef],
  );

  return (
    <Flex miw="100%" gap="sm">
      <NotebookCell className={S.JoinCell} color={color}>
        <Flex gap={6} align="center">
          <NotebookCellItem color={color} disabled aria-label={t`Left table`}>
            {lhsTableName}
          </NotebookCellItem>
          <JoinStrategyPicker
            query={query}
            stageIndex={stageIndex}
            strategy={strategy}
            isReadOnly={isReadOnly}
            onChange={setStrategy}
          />
          <JoinTablePicker
            query={query}
            stageIndex={stageIndex}
            table={rhsTable}
            color={color}
            isReadOnly={isReadOnly}
            columnPicker={
              <JoinTableColumnDraftPicker
                query={query}
                stageIndex={stageIndex}
                columns={rhsTableColumns}
                selectedColumns={selectedRhsTableColumns}
                onChange={setSelectedRhsTableColumns}
              />
            }
            onChange={handleTableChange}
          />
        </Flex>
      </NotebookCell>
      {rhsTable && (
        <>
          <Flex className={S.JoinConditionOn}>
            <Text c="brand" fw="bold">{t`on`}</Text>
          </Flex>
          <NotebookCell
            className={S.JoinConditionCell}
            color={color}
            data-testid="new-join-condition"
            p={rem("6px")}
          >
            <JoinConditionDraft
              query={query}
              stageIndex={stageIndex}
              joinable={rhsTable}
              strategy={strategy}
              lhsTableName={lhsTableName}
              rhsTable={rhsTable}
              rhsTableName={rhsTableName}
              isReadOnly={isReadOnly}
              isRemovable={false}
              onChange={handleConditionChange}
              onLhsExpressionChange={setLhsExpression}
            />
          </NotebookCell>
        </>
      )}
    </Flex>
  );
}
