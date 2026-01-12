import { useState } from "react";

import {
  QueryEditor,
  getInitialUiState,
} from "metabase/querying/editor/components/QueryEditor";
import { useQueryResults } from "metabase/querying/editor/hooks/use-query-results";
import { Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

interface QueryEditorAndResultsProps {
  question: Question;
}

export function QueryEditorAndResults(props: QueryEditorAndResultsProps) {
  const { question: initialQuestion } = props;

  const [uiState, setUiState] = useState(getInitialUiState);
  const [currentQuestion, setCurrentQuestion] = useState(initialQuestion);

  const { isRunnable, runQuery } = useQueryResults(
    currentQuestion,
    uiState,
    setUiState,
  );

  const onQueryChange = (query: Lib.Query) => {
    const updatedQuestion = currentQuestion.setQuery(query);
    setCurrentQuestion(updatedQuestion);
  };

  const handleRunQuery = () => {
    if (isRunnable) {
      runQuery();
    }
  };

  return (
    <Stack w="100%" h="100%" gap={0}>
      <QueryEditor
        query={currentQuestion.query()}
        uiState={uiState}
        onChangeQuery={onQueryChange}
        onChangeUiState={setUiState}
        onAcceptProposed={handleRunQuery}
        onRejectProposed={() => {}}
      />
    </Stack>
  );
}
