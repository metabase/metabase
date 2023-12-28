import { useMemo } from "react";
import { t } from "ttag";
import { QueryColumnPicker } from "metabase/common/components/QueryColumnPicker";
import * as Lib from "metabase-lib";
import type { NotebookStepUiComponentProps } from "../../types";
import { ClauseStep } from "../ClauseStep";

const breakoutTetherOptions = {
  attachment: "top left",
  targetAttachment: "bottom left",
  offset: "10px 0",
  constraints: [
    {
      to: "scrollParent",
      attachment: "together",
    },
  ],
};

function BreakoutStep({
  topLevelQuery,
  step,
  color,
  isLastOpened,
  readOnly,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const { stageIndex } = step;

  const breakouts = useMemo(() => {
    return Lib.breakouts(topLevelQuery, stageIndex);
  }, [topLevelQuery, stageIndex]);

  const renderBreakoutName = (clause: Lib.BreakoutClause) =>
    Lib.displayInfo(topLevelQuery, stageIndex, clause).longDisplayName;

  const handleAddBreakout = (column: Lib.ColumnMetadata) => {
    const nextQuery = Lib.breakout(topLevelQuery, stageIndex, column);
    updateQuery(nextQuery);
  };

  const handleUpdateBreakoutColumn = (
    clause: Lib.BreakoutClause,
    column: Lib.ColumnMetadata,
  ) => {
    const nextQuery = Lib.replaceClause(
      topLevelQuery,
      stageIndex,
      clause,
      column,
    );
    updateQuery(nextQuery);
  };

  const handleRemoveBreakout = (clause: Lib.BreakoutClause) => {
    const nextQuery = Lib.removeClause(topLevelQuery, stageIndex, clause);
    updateQuery(nextQuery);
  };

  return (
    <ClauseStep
      items={breakouts}
      initialAddText={t`Pick a column to group by`}
      readOnly={readOnly}
      color={color}
      isLastOpened={isLastOpened}
      tetherOptions={breakoutTetherOptions}
      renderName={renderBreakoutName}
      renderPopover={({ item: breakout, index }) => (
        <BreakoutPopover
          query={topLevelQuery}
          stageIndex={stageIndex}
          breakout={breakout}
          breakoutIndex={index}
          onAddBreakout={handleAddBreakout}
          onUpdateBreakoutColumn={handleUpdateBreakoutColumn}
        />
      )}
      onRemove={handleRemoveBreakout}
      data-testid="breakout-step"
      withLegacyPopover
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
  onClose?: () => void;
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

    const filteredColumns = columns.filter(column => {
      const columnInfo = Lib.displayInfo(query, stageIndex, column);
      const isAlreadyUsed = columnInfo.breakoutPosition != null;
      const isSelected = checkColumnSelected(columnInfo, breakoutIndex);
      return isSelected || !isAlreadyUsed;
    });

    return Lib.groupColumns(filteredColumns);
  }, [query, stageIndex, breakoutIndex]);

  return (
    <QueryColumnPicker
      query={query}
      stageIndex={stageIndex}
      columnGroups={columnGroups}
      hasBinning
      hasTemporalBucketing
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
  columnInfo: Lib.ColumnDisplayInfo,
  breakoutIndex?: number,
) => {
  return breakoutIndex != null && columnInfo.breakoutPosition === breakoutIndex;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default BreakoutStep;
