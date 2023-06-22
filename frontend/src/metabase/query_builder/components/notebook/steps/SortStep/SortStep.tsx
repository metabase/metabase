import { t } from "ttag";

import { Icon } from "metabase/core/components/Icon";
import QueryColumnPicker from "metabase/common/components/QueryColumnPicker";

import * as Lib from "metabase-lib";

import type { NotebookStepUiComponentProps } from "../../types";
import ClauseStep from "../ClauseStep";
import { SortDirectionButton } from "./SortStep.styled";

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

  const checkColumnSelected = (
    columnInfo: Lib.ColumnDisplayInfo,
    orderByIndex?: number,
  ) => {
    return (
      typeof orderByIndex === "number" &&
      columnInfo.orderByPosition === orderByIndex
    );
  };

  const getColumnGroups = (orderByIndex?: number) => {
    const columns = Lib.orderableColumns(topLevelQuery, stageIndex);

    const filteredColumns = columns.filter(column => {
      const columnInfo = Lib.displayInfo(topLevelQuery, stageIndex, column);

      const isAlreadyUsed = columnInfo.orderByPosition != null;
      const isSelected = checkColumnSelected(columnInfo, orderByIndex);

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
    const nextClause = Lib.orderByClause(column);
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
          displayInfo={Lib.displayInfo(topLevelQuery, stageIndex, clause)}
          onToggleSortDirection={() => handleToggleOrderByDirection(clause)}
        />
      )}
      renderPopover={(orderBy, orderByIndex) => (
        <QueryColumnPicker
          query={topLevelQuery}
          stageIndex={stageIndex}
          columnGroups={getColumnGroups(orderByIndex)}
          checkIsColumnSelected={item =>
            checkColumnSelected(item, orderByIndex)
          }
          onSelect={(column: Lib.ColumnMetadata) => {
            const isUpdate = orderBy != null;
            if (isUpdate) {
              handleUpdateOrderByField(orderBy, column);
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
