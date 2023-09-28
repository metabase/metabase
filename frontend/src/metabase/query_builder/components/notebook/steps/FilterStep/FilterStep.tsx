import { useMemo } from "react";
import { t } from "ttag";
import { FilterPicker } from "metabase/common/components/FilterPicker";
import * as Lib from "metabase-lib";
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

  const handleAddFilter = (filter: Lib.FilterClause) => {
    const nextQuery = Lib.filter(topLevelQuery, stageIndex, filter);
    updateQuery(nextQuery);
  };

  const handleUpdateFilter = (
    filter: Lib.FilterClause,
    nextFilter: Lib.FilterClause,
  ) => {
    const nextQuery = Lib.replaceClause(
      topLevelQuery,
      stageIndex,
      filter,
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
    <ClauseStep
      items={filters}
      initialAddText={t`Add filters to narrow your answer`}
      readOnly={readOnly}
      color={color}
      isLastOpened={isLastOpened}
      renderName={renderFilterName}
      renderPopover={filter => (
        <FilterPicker
          query={topLevelQuery}
          stageIndex={stageIndex}
          filter={filter}
          onSelect={nextFilter => {
            if (filter) {
              handleUpdateFilter(filter, nextFilter);
            } else {
              handleAddFilter(nextFilter);
            }
          }}
        />
      )}
      onRemove={handleRemoveFilter}
    />
  );
}
