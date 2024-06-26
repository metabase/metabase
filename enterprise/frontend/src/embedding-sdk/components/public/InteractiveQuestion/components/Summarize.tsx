import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context/context";
import {
  SummarizeContent,
  useSummarizeQuery,
} from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/SummarizeContent";
import { Button, Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const Summarize = () => {
  const { onQueryChange, question, setIsSummarizeOpen } =
    useInteractiveQuestionContext();

  return (
    question && (
      <SummarizeInner
        question={question}
        onQueryChange={onQueryChange}
        onClose={() => setIsSummarizeOpen(false)}
      />
    )
  );
};

const SummarizeInner = ({
  question,
  onQueryChange,
  onClose,
}: {
  question: Question;
  onQueryChange: (query: Lib.Query) => void;
  onClose: () => void;
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
    <Stack>
      <Button onClick={onClose}>Close</Button>
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
    </Stack>
  );
};
