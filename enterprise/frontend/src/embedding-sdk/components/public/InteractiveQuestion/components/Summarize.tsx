import { useRef, useState } from "react";
import { t } from "ttag";

import {
  SummarizeContent,
  useSummarizeQuery,
} from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/SummarizeContent";
import { Button, Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { useInteractiveQuestionData } from "../hooks";

type SummarizeProps = {
  onClose: () => void;
};

export const Summarize = ({ onClose = () => {} }: Partial<SummarizeProps>) => {
  const { question } = useInteractiveQuestionData();

  return question && <SummarizeInner question={question} onClose={onClose} />;
};

const SummarizeInner = ({
  question,
  onClose,
}: {
  question: Question;
} & SummarizeProps) => {
  const { onQueryChange } = useInteractiveQuestionData();

  // save initial question in case we close without making changes
  const initialQuestion = useRef(question.query());

  const [currentQuery, setCurrentQuery] = useState<Lib.Query>(question.query());

  const onApplyFilter = () => {
    if (query) {
      onQueryChange(currentQuery);
      onClose();
    }
  };

  const onCloseFilter = () => {
    if (initialQuestion.current) {
      onQueryChange(initialQuestion.current);
    }
    onClose();
  };

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
  } = useSummarizeQuery(currentQuery, setCurrentQuery);

  return (
    <Stack>
      <Button onClick={onCloseFilter}>{t`Close`}</Button>
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
      <Button onClick={onApplyFilter}>{t`Apply`}</Button>
    </Stack>
  );
};
