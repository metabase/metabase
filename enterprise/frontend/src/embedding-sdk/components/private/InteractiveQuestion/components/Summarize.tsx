import { useRef, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import {
  SummarizeAggregationItemList,
  SummarizeBreakoutColumnList,
} from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/SummarizeContent";
import { Button, Divider, Group, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { useInteractiveQuestionContext } from "../context";

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
    if (currentQuery) {
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

  const stageIndex = -1;
  const hasAggregations = Lib.aggregations(currentQuery, stageIndex).length > 0;

  return (
    <Stack className={CS.overflowHidden} h="100%" w="100%">
      <Stack className={CS.overflowYScroll}>
        <SummarizeAggregationItemList
          query={currentQuery}
          onQueryChange={setCurrentQuery}
          stageIndex={stageIndex}
        />
        <Divider my="lg" />
        {hasAggregations && (
          <SummarizeBreakoutColumnList
            query={currentQuery}
            onQueryChange={setCurrentQuery}
            stageIndex={stageIndex}
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
