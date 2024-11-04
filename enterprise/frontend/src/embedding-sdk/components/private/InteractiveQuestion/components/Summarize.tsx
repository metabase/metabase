import { useRef, useState } from "react";
import { t } from "ttag";

import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import CS from "metabase/css/core/index.css";
import {
  SummarizeAggregationItemList,
  SummarizeBreakoutColumnList,
  useSummarizeQuery,
} from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/SummarizeContent";
import { Button, Divider, Group, Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

type SummarizeProps = {
  onClose: () => void;
};

export const Summarize = ({ onClose = () => {} }: Partial<SummarizeProps>) => {
  const { question } = useInteractiveQuestionContext();

  return question && <SummarizeInner question={question} onClose={onClose} />;
};

const SummarizeInner = ({
  question,
  onClose,
}: {
  question: Question;
} & SummarizeProps) => {
  const { updateQuestion } = useInteractiveQuestionContext();

  const onQueryChange = (query: Lib.Query) =>
    updateQuestion(question.setQuery(query));

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
    query,
    stageIndex,
    aggregations,
    handleAddBreakout,
    handleQueryChange,
    handleRemoveBreakout,
    handleReplaceBreakouts,
    handleUpdateBreakout,
    hasAggregations,
  } = useSummarizeQuery({
    query: currentQuery,
    onQueryChange: setCurrentQuery,
  });

  return (
    <Stack className={CS.overflowHidden} h="100%" w="100%">
      <Stack className={CS.overflowYScroll}>
        <SummarizeAggregationItemList
          query={query}
          stageIndex={stageIndex}
          aggregations={aggregations}
          onQueryChange={handleQueryChange}
        />
        <Divider my="lg" />
        {hasAggregations && (
          <SummarizeBreakoutColumnList
            query={query}
            stageIndex={stageIndex}
            onAddBreakout={handleAddBreakout}
            onUpdateBreakout={handleUpdateBreakout}
            onRemoveBreakout={handleRemoveBreakout}
            onReplaceBreakouts={handleReplaceBreakouts}
          />
        )}
      </Stack>

      <Group>
        <Button variant="filled" onClick={onApplyFilter}>
          {t`Apply`}
        </Button>
        <Button variant="subtle" color="text-medium" onClick={onCloseFilter}>
          {t`Close`}
        </Button>
      </Group>
    </Stack>
  );
};
