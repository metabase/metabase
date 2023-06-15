import { t } from "ttag";

import * as Types from "metabase-lib";
import { useMetabaseLib } from "metabase-lib/react";

import type { NotebookStepUiComponentProps } from "../../types";
import ClauseStep from "../ClauseStep";
import { BreakoutColumnPicker } from "./BreakoutStep.styled";

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
  const Lib = useMetabaseLib(topLevelQuery, stageIndex);

  const clauses = Lib.breakouts();

  const checkColumnSelected = (
    columnInfo: Types.ColumnDisplayInfo,
    breakoutIndex?: number,
  ) => {
    return (
      typeof breakoutIndex === "number" &&
      columnInfo.breakoutPosition === breakoutIndex
    );
  };

  const getColumnGroups = (breakoutIndex?: number) => {
    const columns = Lib.breakoutableColumns();

    const filteredColumns = columns.filter(column => {
      const columnInfo = Lib.displayInfo(column);

      const isAlreadyUsed = columnInfo.breakoutPosition != null;
      const isSelected = checkColumnSelected(columnInfo, breakoutIndex);

      return isSelected || !isAlreadyUsed;
    });

    return Lib.groupColumns(filteredColumns);
  };

  const handleAddBreakout = (column: Types.ColumnMetadata) => {
    const nextQuery = Lib.breakout(column);
    updateQuery(nextQuery);
  };

  const handleUpdateBreakoutField = (
    clause: Types.BreakoutClause,
    column: Types.ColumnMetadata,
  ) => {
    const nextQuery = Lib.replaceClause(clause, column);
    updateQuery(nextQuery);
  };

  const handleRemoveBreakout = (clause: Types.BreakoutClause) => {
    const nextQuery = Lib.removeClause(clause);
    updateQuery(nextQuery);
  };

  const renderBreakoutName = (clause: Types.BreakoutClause) =>
    Lib.displayInfo(clause).longDisplayName;

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
        <BreakoutColumnPicker
          query={topLevelQuery}
          stageIndex={stageIndex}
          columnGroups={getColumnGroups(breakoutIndex)}
          hasBinning
          hasTemporalBucketing
          checkIsColumnSelected={item =>
            checkColumnSelected(item, breakoutIndex)
          }
          onSelect={(column: Types.ColumnMetadata) => {
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
