import { FilterPanel } from "metabase/querying/filters/components/FilterPanel";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { QueryBuilderMode } from "metabase-types/store";

interface FilterHeaderProps {
  question: Question;
  expanded: boolean;
  updateQuestion: (question: Question, opts?: { run?: boolean }) => void;
}

export function QuestionFiltersHeader({
  question,
  expanded,
  updateQuestion,
}: FilterHeaderProps) {
  const query = question.query();

  const handleChange = (query: Lib.Query) => {
    updateQuestion(question.setQuery(query), { run: true });
  };

  if (!expanded) {
    return null;
  }

  return <FilterPanel query={query} onChange={handleChange} />;
}

type RenderCheckOpts = {
  question: Question;
  queryBuilderMode: QueryBuilderMode;
};

const shouldRender = ({ question, queryBuilderMode }: RenderCheckOpts) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return (
    queryBuilderMode === "view" &&
    !isNative &&
    isEditable &&
    !question.isArchived()
  );
};

QuestionFiltersHeader.shouldRender = shouldRender;
