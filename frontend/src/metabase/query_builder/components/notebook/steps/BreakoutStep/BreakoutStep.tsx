import { t } from "ttag";

import QueryColumnPicker from "metabase/common/components/QueryColumnPicker";
import * as Lib from "metabase-lib";

import type { NotebookStepUiComponentProps } from "../../types";
import ClauseStep from "../ClauseStep";

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

  const clauses = Lib.breakouts(topLevelQuery, stageIndex);

  const checkColumnSelected = (
    columnInfo: Lib.ColumnDisplayInfo,
    breakoutIndex?: number,
  ) => {
    return (
      typeof breakoutIndex === "number" &&
      columnInfo.breakoutPosition === breakoutIndex
    );
  };

  const getColumnGroups = (breakoutIndex?: number) => {
    const columns = Lib.breakoutableColumns(topLevelQuery, stageIndex);

    const filteredColumns = columns.filter(column => {
      const columnInfo = Lib.displayInfo(topLevelQuery, stageIndex, column);

      const isAlreadyUsed = columnInfo.breakoutPosition != null;
      const isSelected = checkColumnSelected(columnInfo, breakoutIndex);

      return isSelected || !isAlreadyUsed;
    });

    return Lib.groupColumns(filteredColumns);
  };

  const handleAddBreakout = (column: Lib.ColumnMetadata) => {
    const nextQuery = Lib.breakout(topLevelQuery, stageIndex, column);
    updateQuery(nextQuery);
  };

  const handleUpdateBreakoutField = (
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

  const renderBreakoutName = (clause: Lib.BreakoutClause) =>
    Lib.displayInfo(topLevelQuery, stageIndex, clause).longDisplayName;

  return (
    <ClauseStep
      items={clauses}
      initialAddText={t`Pick a column to group by`}
      readOnly={readOnly}
      color={color}
      isLastOpened={isLastOpened}
      tetherOptions={breakoutTetherOptions}
      renderName={renderBreakoutName}
      renderPopover={(breakout, breakoutIndex) => (
        <QueryColumnPicker
          query={topLevelQuery}
          stageIndex={stageIndex}
          columnGroups={getColumnGroups(breakoutIndex)}
          hasBinning
          hasTemporalBucketing
          color="summarize"
          checkIsColumnSelected={item =>
            checkColumnSelected(item, breakoutIndex)
          }
          onSelect={(column: Lib.ColumnMetadata) => {
            const isUpdate = breakout != null;
            if (isUpdate) {
              handleUpdateBreakoutField(breakout, column);
            } else {
              handleAddBreakout(column);
            }
          }}
        />
      )}
      onRemove={handleRemoveBreakout}
      data-testid="breakout-step"
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default BreakoutStep;
