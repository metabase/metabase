import { QueryFilterBar } from "metabase/querying/filters/components/QueryFilterBar";
import type { QueryBuilderMode } from "metabase/redux/store";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import ViewTitleHeaderS from "../../ViewTitleHeader.module.css";

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
    updateQuestion(question.setQuery(query), { run: false });
  };

  if (!expanded) {
    return null;
  }

  return (
    <Box
      className={ViewTitleHeaderS.FilterPanel}
      data-testid="qb-filters-panel"
    >
      <QueryFilterBar query={query} onChange={handleChange} />
    </Box>
  );
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
