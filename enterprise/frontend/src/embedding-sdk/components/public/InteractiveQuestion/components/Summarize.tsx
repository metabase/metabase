import { useInteractiveQuestionData } from "embedding-sdk/components/public/InteractiveQuestion/context";
import {
  SummarizeContent,
  useSummarizeQuery,
} from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/SummarizeContent";
import { Button, Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const Summarize = ({ onClose }: { onClose: () => void }) => {
  const { onQueryChange, question } = useInteractiveQuestionData();

  return (
    question && (
      <SummarizeInner
        question={question}
        onQueryChange={onQueryChange}
        onClose={onClose}
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
    query,
    stageIndex,
    handleAddAggregations,
    handleAddBreakout,
    handleRemoveAggregation,
    handleRemoveBreakout,
    handleReplaceBreakouts,
    handleUpdateAggregation,
    handleUpdateBreakout,
  } = useSummarizeQuery(question.query(), onQueryChange);

  return (
    <Stack>
      <Button onClick={onClose}>Close</Button>
      <SummarizeContent
        query={query}
        stageIndex={stageIndex}
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
