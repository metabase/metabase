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
  const orderableColumns = Lib.orderableColumns(topLevelQuery, stageIndex);

  const handleAddOrderBy = (column: Lib.ColumnMetadata) => {
    const nextQuery = Lib.orderBy(topLevelQuery, column);
    updateQuery(nextQuery);
  };

  const handleToggleOrderByDirection = (clause: Lib.OrderByClause) => {
    // noop
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
    const nextQuery = Lib.removeClause(topLevelQuery, clause);
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
          onClick={() => handleToggleOrderByDirection(clause)}
        />
      )}
      renderPopover={clause => (
        <SortColumnPicker
          query={topLevelQuery}
          columns={orderableColumns}
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
  onClick: () => void;
}

function SortDisplayName({ displayInfo, onClick }: SortDisplayNameProps) {
  const icon = displayInfo.direction === "asc" ? "arrow_up" : "arrow_down";
  return (
    <SortDirectionButton aria-label={t`Change direction`} onClick={onClick}>
      <Icon name={icon} />
      <span>{displayInfo.display_name}</span>
    </SortDirectionButton>
  );
}

export default SortStep;
