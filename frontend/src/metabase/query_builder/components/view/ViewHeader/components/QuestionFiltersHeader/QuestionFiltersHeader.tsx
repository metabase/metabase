import type { Dispatch, SetStateAction } from "react";

import { FilterPanel } from "metabase/querying/filters/components/FilterPanel";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { QueryBuilderMode } from "metabase-types/store";

interface FilterHeaderProps {
  question: Question;
  expanded: boolean;
  updateQuestion: (question: Question, opts: { run: boolean }) => void;

  dirtyAddedFilters: Filter[];
  dirtyRemovedFilters: Filter[];
  setDirtyAddedFilters: Dispatch<SetStateAction<Filter[]>>;
  setDirtyRemovedFilters: Dispatch<SetStateAction<Filter[]>>;
}

type Filter = Lib.Clause | Lib.SegmentMetadata;

export function QuestionFiltersHeader({
  question,
  expanded,
  updateQuestion,
  dirtyAddedFilters,
  dirtyRemovedFilters,
  setDirtyAddedFilters,
  setDirtyRemovedFilters,
}: FilterHeaderProps) {
  const query = question.query();

  const handleChange = (query: Lib.Query) => {
    updateQuestion(question.setQuery(query), { run: true });
  };

  if (!expanded) {
    return null;
  }

  return (
    <FilterPanel
      query={query}
      onChange={handleChange}
      dirtyAddedFilters={dirtyAddedFilters}
      dirtyRemovedFilters={dirtyRemovedFilters}
      setDirtyAddedFilters={setDirtyAddedFilters}
      setDirtyRemovedFilters={setDirtyRemovedFilters}
    />
  );
}

type RenderCheckOpts = {
  question: Question;
  queryBuilderMode: QueryBuilderMode;
  isObjectDetail: boolean;
};

const shouldRender = ({
  question,
  queryBuilderMode,
  isObjectDetail,
}: RenderCheckOpts) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return (
    queryBuilderMode === "view" &&
    !isNative &&
    isEditable &&
    !isObjectDetail &&
    !question.isArchived()
  );
};

QuestionFiltersHeader.shouldRender = shouldRender;
