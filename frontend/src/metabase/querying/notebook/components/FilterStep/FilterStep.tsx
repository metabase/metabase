import { useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useTopDbFields } from "metabase/common/hooks";
import * as Lib from "metabase-lib";
import Field from "metabase-lib/v1/metadata/Field";

import type { NotebookStepProps } from "../../types";
import { ClauseStep } from "../ClauseStep";

import { FilterPopover } from "./FilterPopover";
import { FilterSuggestion } from "./FilterSuggestion";

export function FilterStep({
  query,
  step,
  color,
  isLastOpened,
  readOnly,
  updateQuery,
}: NotebookStepProps) {
  const { stageIndex } = step;

  const topDbFields = useTopDbFields(query, stageIndex, "field_usage_filter");

  const filters = useMemo(
    () => Lib.filters(query, stageIndex),
    [query, stageIndex],
  );

  const renderFilterName = (filter: Lib.FilterClause) =>
    Lib.displayInfo(query, stageIndex, filter).longDisplayName;

  const handleAddFilter = (clause: Lib.Filterable) => {
    const nextQuery = Lib.filter(query, stageIndex, clause);
    updateQuery(nextQuery);
  };

  const handleUpdateFilter = (
    targetClause: Lib.FilterClause,
    newClause: Lib.Filterable,
  ) => {
    const nextQuery = Lib.replaceClause(
      query,
      stageIndex,
      targetClause,
      newClause,
    );
    updateQuery(nextQuery);
  };

  const handleReorderFilter = (
    sourceClause: Lib.FilterClause,
    targetClause: Lib.FilterClause,
  ) => {
    const nextQuery = Lib.swapClauses(
      query,
      stageIndex,
      sourceClause,
      targetClause,
    );
    updateQuery(nextQuery);
  };

  const handleRemoveFilter = (clause: Lib.FilterClause) => {
    const nextQuery = Lib.removeClause(query, stageIndex, clause);
    updateQuery(nextQuery);
  };

  return (
    <ErrorBoundary>
      <ClauseStep
        items={filters}
        initialAddText={t`Add filters to narrow your answer`}
        readOnly={readOnly}
        color={color}
        isLastOpened={isLastOpened}
        renderName={renderFilterName}
        renderPopover={({ item: filter, index, onClose }) => (
          <FilterPopover
            query={query}
            stageIndex={stageIndex}
            filter={filter}
            filterIndex={index}
            onAddFilter={handleAddFilter}
            onUpdateFilter={handleUpdateFilter}
            onClose={onClose}
          />
        )}
        onReorder={handleReorderFilter}
        onRemove={handleRemoveFilter}
      >
        {topDbFields.map(field => (
          <FilterSuggestion
            key={new Field(field).getUniqueId()}
            stageIndex={stageIndex}
            handleAddFilter={handleAddFilter}
            handleUpdateFilter={handleUpdateFilter}
            field={field}
            query={query}
          />
        ))}
      </ClauseStep>
    </ErrorBoundary>
  );
}
