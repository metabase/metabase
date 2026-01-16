import { useMemo } from "react";
import { t } from "ttag";

import { QueryColumnPicker } from "metabase/common/components/QueryColumnPicker";
import { useTranslateContent } from "metabase/i18n/hooks";
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
  const { question, stageIndex } = step;
  const isMetric = question.type() === "metric";
  const tc = useTranslateContent();

  const breakouts = useMemo(
    () => Lib.breakouts(query, stageIndex),
    [query, stageIndex],
  );

  const metricColumns = useMemo(() => {
    return isMetric
      ? Lib.breakoutableColumns(query, stageIndex).filter(Lib.isDateOrDateTime)
      : [];
  }, [query, stageIndex, isMetric]);

  const hasAddButton = !readOnly && (!isMetric || breakouts.length === 0);
  const isAddButtonDisabled = isMetric && metricColumns.length === 0;

  const renderBreakoutName = (clause: Lib.BreakoutClause) =>
    tc(Lib.displayInfo(query, stageIndex, clause).longDisplayName);

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
      initialAddText={
        isAddButtonDisabled
          ? t`No datetime columns available`
          : t`Pick a column to group by`
      }
      readOnly={readOnly}
      color={color}
      isLastOpened={isLastOpened}
      hasAddButton={hasAddButton}
      isAddButtonDisabled={isAddButtonDisabled}
      renderName={renderBreakoutName}
      renderPopover={({ item: breakout, index, onClose }) =>
        readOnly ? null : (
          <BreakoutPopover
            query={query}
            stageIndex={stageIndex}
            breakout={breakout}
            breakoutIndex={index}
            isMetric={isMetric}
            onAddBreakout={handleAddBreakout}
            onUpdateBreakoutColumn={handleUpdateBreakoutColumn}
            onClose={onClose}
          />
        )
      }
      onReorder={handleReorderBreakout}
      onRemove={handleRemoveBreakout}
      data-testid="breakout-step"
    />
  );
}

interface BreakoutPopoverProps {
  className?: string;
  query: Lib.Query;
  stageIndex: number;
  breakout: Lib.BreakoutClause | undefined;
  breakoutIndex: number | undefined;
  isMetric: boolean;
  onAddBreakout: (column: Lib.ColumnMetadata) => void;
  onUpdateBreakoutColumn: (
    breakout: Lib.BreakoutClause,
    column: Lib.ColumnMetadata,
  ) => void;
  onClose: () => void;
}

export const BreakoutPopover = ({
  className,
  query,
  stageIndex,
  breakout,
  breakoutIndex,
  isMetric,
  onAddBreakout,
  onUpdateBreakoutColumn,
  onClose,
}: BreakoutPopoverProps) => {
  const columnGroups = useMemo(() => {
    const columns = Lib.breakoutableColumns(query, stageIndex);
    const filteredColumns = columns.reduce(
      (columns: Lib.ColumnMetadata[], column) => {
        const columnInfo = Lib.displayInfo(query, stageIndex, column);
        if (isMetric && !Lib.isDateOrDateTime(column)) {
          return columns;
        } else if (breakout && checkColumnSelected(columnInfo, breakoutIndex)) {
          const column = Lib.breakoutColumn(query, stageIndex, breakout);
          if (column != null) {
            columns.push(column);
          }
        } else {
          columns.push(column);
        }
        return columns;
      },
      [],
    );
    return Lib.groupColumns(filteredColumns);
  }, [query, stageIndex, breakout, breakoutIndex, isMetric]);

  return (
    <QueryColumnPicker
      className={className}
      query={query}
      stageIndex={stageIndex}
      columnGroups={columnGroups}
      hasBinning
      hasTemporalBucketing
      withInfoIcons
      color="summarize"
      checkIsColumnSelected={(item) => checkColumnSelected(item, breakoutIndex)}
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
