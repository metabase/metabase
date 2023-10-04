import { useMemo } from "react";
import { t } from "ttag";
import { FilterPicker } from "metabase/common/components/FilterPicker";
import * as Lib from "metabase-lib";
import ErrorBoundary from "metabase/ErrorBoundary";
import type { NotebookStepUiComponentProps } from "../../types";
import ClauseStep from "../ClauseStep";

export function FilterStep({
  topLevelQuery,
  step,
  color,
  isLastOpened,
  readOnly,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const { stageIndex } = step;

  const filters = useMemo(
    () => Lib.filters(topLevelQuery, stageIndex),
    [topLevelQuery, stageIndex],
  );

  const handleAddFilter = (filter: Lib.ExpressionClause) => {
    const nextQuery = Lib.filter(topLevelQuery, stageIndex, filter);
    updateQuery(nextQuery);
  };

  const handleUpdateFilter = (
    targetFilter: Lib.FilterClause,
    nextFilter: Lib.ExpressionClause,
  ) => {
    const nextQuery = Lib.replaceClause(
      topLevelQuery,
      stageIndex,
      targetFilter,
      nextFilter,
    );
    updateQuery(nextQuery);
  };

  const handleRemoveFilter = (filter: Lib.FilterClause) => {
    const nextQuery = Lib.removeClause(topLevelQuery, stageIndex, filter);
    updateQuery(nextQuery);
  };

  const renderFilterName = (filter: Lib.FilterClause) =>
    Lib.displayInfo(topLevelQuery, stageIndex, filter).longDisplayName;

  return (
    <ErrorBoundary>
      <ClauseStep
        items={filters}
        initialAddText={t`Add filters to narrow your answer`}
        readOnly={readOnly}
        color={color}
        isLastOpened={isLastOpened}
        renderName={renderFilterName}
        renderPopover={filter => (
          <FilterPopover
            query={topLevelQuery}
            stageIndex={stageIndex}
            filter={filter}
            onAddFilter={handleAddFilter}
            onUpdateFilter={handleUpdateFilter}
          />
        )}
        onRemove={handleRemoveFilter}
      />
    </ErrorBoundary>
  );
}

interface FilterPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  filter: Lib.FilterClause | undefined;
  onAddFilter: (filter: Lib.ExpressionClause) => void;
  onUpdateFilter: (
    targetFilter: Lib.FilterClause,
    nextFilter: Lib.ExpressionClause,
  ) => void;
  onClose?: () => void;
}

function FilterPopover({
  query,
  stageIndex,
  filter,
  onAddFilter,
  onUpdateFilter,
  onClose,
}: FilterPopoverProps) {
  return (
    <FilterPicker
      query={query}
      stageIndex={stageIndex}
      filter={filter}
      onSelect={newFilter => {
        if (filter) {
          onUpdateFilter(filter, newFilter);
        } else {
          onAddFilter(newFilter);
        }
        onClose?.();
      }}
    />
  );
}
