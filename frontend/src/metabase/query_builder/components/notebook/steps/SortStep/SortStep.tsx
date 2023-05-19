import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import * as Lib from "metabase-lib";

import type { NotebookStepUiComponentProps } from "../../types";
import ClauseStep from "../ClauseStep";
import { SortDirectionButton, SortColumnPicker } from "./SortStep.styled";

function SortStep({
  topLevelQuery,
  step,
  color,
  isLastOpened,
  readOnly,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const { stageIndex } = step;

  const clauses = Lib.orderBys(topLevelQuery, stageIndex);

  const getColumnGroups = (clause?: Lib.OrderByClause) => {
    const columns = Lib.orderableColumns(topLevelQuery, stageIndex);

    const filteredColumns = columns.filter(column => {
      const isSelected =
        clause && Lib.isClauseColumn(topLevelQuery, clause, column);

      const isAlreadyUsed =
        Lib.displayInfo(topLevelQuery, column).orderByPosition != null;

      return isSelected || !isAlreadyUsed;
    });

    return Lib.groupColumns(filteredColumns);
  };

  const handleAddOrderBy = (column: Lib.ColumnMetadata) => {
    const nextQuery = Lib.orderBy(topLevelQuery, stageIndex, column, "asc");
    updateQuery(nextQuery);
  };

  const handleToggleOrderByDirection = (clause: Lib.OrderByClause) => {
    const nextQuery = Lib.changeDirection(topLevelQuery, clause);
    updateQuery(nextQuery);
  };

  const handleUpdateOrderByField = (
    clause: Lib.OrderByClause,
    column: Lib.ColumnMetadata,
  ) => {
    const nextClause = Lib.orderByClause(topLevelQuery, stageIndex, column);
    const nextQuery = Lib.replaceClause(
      topLevelQuery,
      stageIndex,
      clause,
      nextClause,
    );
    updateQuery(nextQuery);
  };

  const handleRemoveOrderBy = (clause: Lib.OrderByClause) => {
    const nextQuery = Lib.removeClause(topLevelQuery, stageIndex, clause);
    updateQuery(nextQuery);
  };

  return (
    <ClauseStep
      items={clauses}
      readOnly={readOnly}
      color={color}
      isLastOpened={isLastOpened}
      renderName={clause => (
        <SortDisplayName
          displayInfo={Lib.displayInfo(topLevelQuery, clause)}
          onToggleSortDirection={() => handleToggleOrderByDirection(clause)}
        />
      )}
      renderPopover={clause => (
        <SortColumnPicker
          query={topLevelQuery}
          columnGroups={getColumnGroups(clause)}
          onSelect={(column: Lib.ColumnMetadata) => {
            const isUpdate = clause != null;
            if (isUpdate) {
              handleUpdateOrderByField(clause, column);
            } else {
              handleAddOrderBy(column);
            }
          }}
        />
      )}
      onRemove={handleRemoveOrderBy}
    />
  );
}

interface SortDisplayNameProps {
  displayInfo: Lib.OrderByClauseDisplayInfo;
  onToggleSortDirection: () => void;
}

function SortDisplayName({
  displayInfo,
  onToggleSortDirection,
}: SortDisplayNameProps) {
  const icon = displayInfo.direction === "asc" ? "arrow_up" : "arrow_down";
  return (
    <SortDirectionButton
      aria-label={t`Change direction`}
      onClick={event => {
        event.stopPropagation();
        onToggleSortDirection();
      }}
    >
      <Icon name={icon} />
      <span>{displayInfo.longDisplayName}</span>
    </SortDirectionButton>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SortStep;
