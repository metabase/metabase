import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import {
  SummarizeContent,
  useSummarizeQuery,
} from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/SummarizeContent";

export const Summarize = () => {
  const { onQueryChange, question } = useInteractiveQuestionContext();

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
