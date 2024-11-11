import { BreakoutColumnList } from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/BreakoutColumnList";
import type * as Lib from "metabase-lib";

import { useInteractiveQuestionContext } from "../context";

export const Breakout = () => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

  const onQueryChange = (query: Lib.Query) => {
    if (question) {
      return updateQuestion(question.setQuery(query));
    }
  };

  if (!question) {
    return null;
  }

  return (
    <BreakoutColumnList
      query={question.query()}
      onQueryChange={onQueryChange}
    />
  );
};
