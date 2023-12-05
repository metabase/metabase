import { useMemo } from "react";
import { t } from "ttag";
import ErrorBoundary from "metabase/ErrorBoundary";
import type { PopoverBaseProps } from "metabase/ui";
import { FilterPicker } from "metabase/querying";
import * as Lib from "metabase-lib";
import type LegacyQuery from "metabase-lib/queries/StructuredQuery";
import type { NotebookStepUiComponentProps } from "../../types";
import { ClauseStep } from "../ClauseStep";

const POPOVER_PROPS: PopoverBaseProps = {
  position: "bottom-start",
  offset: { mainAxis: 4 },
};

export function FilterStep({
  query: legacyQuery,
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

  const handleAddFilter = (
    filter: Lib.ExpressionClause | Lib.FilterClause | Lib.SegmentMetadata,
  ) => {
    const nextQuery = Lib.filter(topLevelQuery, stageIndex, filter);
    updateQuery(nextQuery);
  };

  const handleUpdateFilter = (
    targetFilter: Lib.FilterClause,
    nextFilter: Lib.ExpressionClause | Lib.FilterClause | Lib.SegmentMetadata,
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
        popoverProps={POPOVER_PROPS}
        renderName={renderFilterName}
        renderPopover={({ item: filter, index, onClose }) => (
          <FilterPopover
            query={topLevelQuery}
            stageIndex={stageIndex}
            filter={filter}
            filterIndex={index}
            legacyQuery={legacyQuery}
            onAddFilter={handleAddFilter}
            onUpdateFilter={handleUpdateFilter}
            onClose={onClose}
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
  filter?: Lib.FilterClause;
  filterIndex?: number;
  legacyQuery: LegacyQuery;
  onAddFilter: (
    filter: Lib.ExpressionClause | Lib.FilterClause | Lib.SegmentMetadata,
  ) => void;
  onUpdateFilter: (
    targetFilter: Lib.FilterClause,
    nextFilter: Lib.ExpressionClause | Lib.FilterClause | Lib.SegmentMetadata,
  ) => void;
  onClose?: () => void;
}

function FilterPopover({
  query,
  stageIndex,
  filter,
  filterIndex,
  legacyQuery,
  onAddFilter,
  onUpdateFilter,
  onClose,
}: FilterPopoverProps) {
  return (
    <FilterPicker
      query={query}
      stageIndex={stageIndex}
      filter={filter}
      filterIndex={filterIndex}
      legacyQuery={legacyQuery}
      onSelect={newFilter => {
        if (filter) {
          onUpdateFilter(filter, newFilter);
        } else {
          onAddFilter(newFilter);
        }
      }}
      onClose={onClose}
    />
  );
}
