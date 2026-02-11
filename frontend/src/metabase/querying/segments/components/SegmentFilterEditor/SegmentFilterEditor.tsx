import { useCallback, useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { ClauseStep } from "metabase/querying/notebook/components/ClauseStep";
import * as Lib from "metabase-lib";

const STAGE_INDEX = -1;

type SegmentFilterEditorProps = {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
  readOnly?: boolean;
};

export function SegmentFilterEditor({
  query,
  onChange,
  readOnly = false,
}: SegmentFilterEditorProps) {
  const filters = useMemo(() => Lib.filters(query, STAGE_INDEX), [query]);

  const renderFilterName = useCallback(
    (filter: Lib.FilterClause) =>
      Lib.displayInfo(query, STAGE_INDEX, filter).longDisplayName,
    [query],
  );

  const handleSelectFilter = useCallback(
    (filter: Lib.FilterClause | undefined, newFilter: Lib.Filterable) => {
      const nextQuery = filter
        ? Lib.replaceClause(query, STAGE_INDEX, filter, newFilter)
        : Lib.filter(query, STAGE_INDEX, newFilter);
      onChange(nextQuery);
    },
    [query, onChange],
  );

  const handleReorderFilter = useCallback(
    (sourceClause: Lib.FilterClause, targetClause: Lib.FilterClause) => {
      const nextQuery = Lib.swapClauses(
        query,
        STAGE_INDEX,
        sourceClause,
        targetClause,
      );
      onChange(nextQuery);
    },
    [query, onChange],
  );

  const handleRemoveFilter = useCallback(
    (clause: Lib.FilterClause) => {
      const nextQuery = Lib.removeClause(query, STAGE_INDEX, clause);
      onChange(nextQuery);
    },
    [query, onChange],
  );

  return (
    <ErrorBoundary>
      <ClauseStep
        items={filters}
        initialAddText={t`Add filters to narrow your answer`}
        readOnly={readOnly}
        color="filter"
        isLastOpened={false}
        renderName={renderFilterName}
        renderPopover={({ item: filter, index, onClose }) => (
          <FilterPicker
            query={query}
            stageIndex={STAGE_INDEX}
            filter={filter}
            filterIndex={index}
            onSelect={(newFilter) => handleSelectFilter(filter, newFilter)}
            onClose={onClose}
            readOnly={readOnly}
          />
        )}
        onReorder={handleReorderFilter}
        onRemove={handleRemoveFilter}
      />
    </ErrorBoundary>
  );
}
