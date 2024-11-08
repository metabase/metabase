import { useMemo } from "react";

import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export type UseSelectedFiltersProps = {
  question: Question;
  updateQuestion: (question: Question, opts: { run: boolean }) => void;
};

export const useSelectedFilters = ({
  question,
  updateQuestion,
}: UseSelectedFiltersProps) => {
  const query = question.query();

  const items = useMemo(() => getFilterItems(query), [query]);

  const updateFilter = (query: Lib.Query) => {
    updateQuestion(question.setQuery(Lib.dropEmptyStages(query)), {
      run: true,
    });
  };

  return items.map(({ filter, stageIndex }) => {
    const { displayName, longDisplayName, name, table } = Lib.displayInfo(
      query,
      stageIndex,
      filter,
    );
    const handleChange = (newFilter: Lib.Clause | Lib.SegmentMetadata) => {
      updateFilter(Lib.replaceClause(query, stageIndex, filter, newFilter));
    };

    const handleRemove = () => {
      updateFilter(Lib.removeClause(query, stageIndex, filter));
    };

    return {
      query,
      filter,
      stageIndex,
      displayName,
      longDisplayName,
      name,
      table,
      handleChange,
      handleRemove,
    };
  });
};
