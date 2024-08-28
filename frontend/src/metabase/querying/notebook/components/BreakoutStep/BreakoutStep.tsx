import { useMemo } from "react";
import { t } from "ttag";

import { QueryColumnPicker } from "metabase/common/components/QueryColumnPicker";
import * as Lib from "metabase-lib";

import type { NotebookStepProps } from "../../types";
import { ClauseStep } from "../ClauseStep";

export function BreakoutStep({
  query,
  step,
  color,
  isLastOpened,
  readOnly,
  updateQuery,
}: NotebookStepProps) {
  const { stageIndex } = step;

  const breakouts = useMemo(() => {
    return Lib.breakouts(query, stageIndex);
  }, [query, stageIndex]);

  const renderBreakoutName = (clause: Lib.BreakoutClause) =>
    Lib.displayInfo(query, stageIndex, clause).longDisplayName;

  const handleAddBreakout = (column: Lib.ColumnMetadata) => {
    const nextQuery = Lib.breakout(query, stageIndex, column);
    updateQuery(nextQuery);
  };

  const handleUpdateBreakoutColumn = (
    clause: Lib.BreakoutClause,
    column: Lib.ColumnMetadata,
  ) => {
    const nextQuery = Lib.replaceClause(query, stageIndex, clause, column);
    updateQuery(nextQuery);
  };

  const handleReorderBreakout = (
    sourceClause: Lib.BreakoutClause,
    targetClause: Lib.BreakoutClause,
  ) => {
    const nextQuery = Lib.swapClauses(
      query,
      stageIndex,
      sourceClause,
      targetClause,
    );
    updateQuery(nextQuery);
  };

  const handleRemoveBreakout = (clause: Lib.BreakoutClause) => {
    const nextQuery = Lib.removeClause(query, stageIndex, clause);
    updateQuery(nextQuery);
  };

  return (
    <ClauseStep
      items={breakouts}
      initialAddText={t`Pick a column to group by`}
      readOnly={readOnly}
      color={color}
      isLastOpened={isLastOpened}
      renderName={renderBreakoutName}
      renderPopover={({ item: breakout, index, onClose }) => (
        <BreakoutPopover
          query={query}
          stageIndex={stageIndex}
          breakout={breakout}
          breakoutIndex={index}
          onAddBreakout={handleAddBreakout}
          onUpdateBreakoutColumn={handleUpdateBreakoutColumn}
          onClose={onClose}
        />
      )}
      onReorder={handleReorderBreakout}
      onRemove={handleRemoveBreakout}
      data-testid="breakout-step"
    />
  );
}

interface BreakoutPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  breakout: Lib.BreakoutClause | undefined;
  breakoutIndex: number | undefined;
  onAddBreakout: (column: Lib.ColumnMetadata) => void;
  onUpdateBreakoutColumn: (
    breakout: Lib.BreakoutClause,
    column: Lib.ColumnMetadata,
  ) => void;
  onClose: () => void;
}

const BreakoutPopover = ({
  query,
  stageIndex,
  breakout,
  breakoutIndex,
  onAddBreakout,
  onUpdateBreakoutColumn,
  onClose,
}: BreakoutPopoverProps) => {
  const columnGroups = useMemo(() => {
    const columns = Lib.breakoutableColumns(query, stageIndex);
    const filteredColumns = columns.reduce(
      (columns: Lib.ColumnMetadata[], column) => {
        const columnInfo = Lib.displayInfo(query, stageIndex, column);
        const { breakoutPositions = [] } = columnInfo;
        if (breakout && checkColumnSelected(columnInfo, breakoutIndex)) {
          columns.push(Lib.breakoutColumn(query, stageIndex, breakout));
        } else if (breakoutPositions.length === 0) {
          columns.push(column);
        }
        return columns;
      },
      [],
    );
    return Lib.groupColumns(filteredColumns);
  }, [query, stageIndex, breakout, breakoutIndex]);

  return (
    <QueryColumnPicker
      query={query}
      stageIndex={stageIndex}
      columnGroups={columnGroups}
      hasBinning
      hasTemporalBucketing
      withInfoIcons
      color="summarize"
      checkIsColumnSelected={item => checkColumnSelected(item, breakoutIndex)}
      onSelect={(column: Lib.ColumnMetadata) => {
        const isUpdate = breakout != null;
        if (isUpdate) {
          onUpdateBreakoutColumn(breakout, column);
        } else {
          onAddBreakout(column);
        }
      }}
      onClose={onClose}
    />
  );
};

const checkColumnSelected = (
  { breakoutPositions = [] }: Lib.ColumnDisplayInfo,
  breakoutIndex?: number,
) => {
  return breakoutIndex != null && breakoutPositions.includes(breakoutIndex);
};
