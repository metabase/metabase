import { useMemo } from "react";
import { t } from "ttag";

import { QueryColumnPicker } from "metabase/common/components/QueryColumnPicker";
import { Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { NotebookStepProps } from "../../types";
import { ClauseStep } from "../ClauseStep";

import { SortDirectionButton } from "./SortStep.styled";

export function SortStep({
  query,
  step,
  color,
  isLastOpened,
  readOnly,
  updateQuery,
}: NotebookStepProps) {
  const { stageIndex } = step;

  const clauses = useMemo(() => {
    return Lib.orderBys(query, stageIndex);
  }, [query, stageIndex]);

  const handleAddOrderBy = (column: Lib.ColumnMetadata) => {
    const nextQuery = Lib.orderBy(query, stageIndex, column, "asc");
    updateQuery(nextQuery);
  };

  const handleToggleOrderByDirection = (clause: Lib.OrderByClause) => {
    const nextQuery = Lib.changeDirection(query, clause);
    updateQuery(nextQuery);
  };

  const handleUpdateOrderByColumn = (
    clause: Lib.OrderByClause,
    column: Lib.ColumnMetadata,
  ) => {
    const nextClause = Lib.orderByClause(column);
    const nextQuery = Lib.replaceClause(query, stageIndex, clause, nextClause);
    updateQuery(nextQuery);
  };

  const handleReorderOrderBy = (
    sourceClause: Lib.OrderByClause,
    targetClause: Lib.OrderByClause,
  ) => {
    const nextQuery = Lib.swapClauses(
      query,
      stageIndex,
      sourceClause,
      targetClause,
    );
    updateQuery(nextQuery);
  };

  const handleRemoveOrderBy = (clause: Lib.OrderByClause) => {
    const nextQuery = Lib.removeClause(query, stageIndex, clause);
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
          displayInfo={Lib.displayInfo(query, stageIndex, clause)}
          onToggleSortDirection={() => handleToggleOrderByDirection(clause)}
        />
      )}
      renderPopover={({ item: orderBy, index, onClose }) => (
        <SortPopover
          query={query}
          stageIndex={stageIndex}
          orderBy={orderBy}
          orderByIndex={index}
          onAddOrderBy={handleAddOrderBy}
          onUpdateOrderByColumn={handleUpdateOrderByColumn}
          onClose={onClose}
        />
      )}
      onReorder={handleReorderOrderBy}
      onRemove={handleRemoveOrderBy}
    />
  );
}

interface SortPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  orderBy: Lib.OrderByClause | undefined;
  orderByIndex: number | undefined;
  onAddOrderBy: (column: Lib.ColumnMetadata) => void;
  onUpdateOrderByColumn: (
    orderBy: Lib.OrderByClause,
    column: Lib.ColumnMetadata,
  ) => void;
  onClose: () => void;
}

const SortPopover = ({
  query,
  stageIndex,
  orderBy,
  orderByIndex,
  onAddOrderBy,
  onUpdateOrderByColumn,
  onClose,
}: SortPopoverProps) => {
  const columnGroups = useMemo(() => {
    const columns = Lib.orderableColumns(query, stageIndex);

    const filteredColumns = columns.filter(column => {
      const columnInfo = Lib.displayInfo(query, stageIndex, column);
      const isAlreadyUsed = columnInfo.orderByPosition != null;
      const isSelected = checkColumnSelected(columnInfo, orderByIndex);
      return isSelected || !isAlreadyUsed;
    });

    return Lib.groupColumns(filteredColumns);
  }, [query, stageIndex, orderByIndex]);

  return (
    <QueryColumnPicker
      query={query}
      stageIndex={stageIndex}
      columnGroups={columnGroups}
      color="text-dark"
      checkIsColumnSelected={item => checkColumnSelected(item, orderByIndex)}
      onSelect={(column: Lib.ColumnMetadata) => {
        const isUpdate = orderBy != null;
        if (isUpdate) {
          onUpdateOrderByColumn(orderBy, column);
        } else {
          onAddOrderBy(column);
        }
      }}
      onClose={onClose}
    />
  );
};

const checkColumnSelected = (
  columnInfo: Lib.ColumnDisplayInfo,
  orderByIndex?: number,
) => {
  return (
    typeof orderByIndex === "number" &&
    columnInfo.orderByPosition === orderByIndex
  );
};

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
