import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import {
  SummarizeContent,
  useSummarizeQuery,
} from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/SummarizeContent";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const Summarize = () => {
  const { onQueryChange, question } = useInteractiveQuestionContext();

  return (
    question && (
      <SummarizeInner question={question} onQueryChange={onQueryChange} />
    )
  );
};

const SummarizeInner = ({
  question,
  onQueryChange,
}: {
  question: Question;
  onQueryChange: (query: Lib.Query) => void;
}) => {
  const {
    aggregations,
    handleAddAggregations,
    handleAddBreakout,
    handleRemoveAggregation,
    handleRemoveBreakout,
    handleReplaceBreakouts,
    handleUpdateAggregation,
    handleUpdateBreakout,
    hasAggregations,
    query,
  } = useSummarizeQuery(question.query(), onQueryChange);

  return (
    <SummarizeContent
      query={query}
      aggregations={aggregations}
      hasAggregations={hasAggregations}
      onAddAggregations={handleAddAggregations}
      onUpdateAggregation={handleUpdateAggregation}
      onRemoveAggregation={handleRemoveAggregation}
      onAddBreakout={handleAddBreakout}
      onUpdateBreakout={handleUpdateBreakout}
      onRemoveBreakout={handleRemoveBreakout}
      onReplaceBreakouts={handleReplaceBreakouts}
    />
  );
};
