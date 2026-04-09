import { useState } from "react";

import {
  QueryEditor,
  getInitialUiState,
} from "metabase/querying/editor/components/QueryEditor";
import { useQueryResults } from "metabase/querying/editor/hooks/use-query-results";
import { VisualizeButton } from "metabase/querying/notebook/components/Notebook";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

interface QueryEditorAndResultsProps {
  question: Question;
  hasVisualizeButton?: boolean;
  isDirty: boolean;
  runQuestionQuery?: () => Promise<void>;
  updateQuestion: (question: Question) => Promise<void>;
}

export function QueryEditorAndResults(props: QueryEditorAndResultsProps) {
  const {
    question: initialQuestion,
    hasVisualizeButton = true,
    isDirty,
    runQuestionQuery,
    updateQuestion,
  } = props;

  const [uiState, setUiState] = useState(getInitialUiState);
  const [currentQuestion, setCurrentQuestion] = useState(initialQuestion);

  const { isRunnable, runQuery, result } = useQueryResults(
    currentQuestion,
    uiState,
    setUiState,
  );

  const onQueryChange = (query: Lib.Query) => {
    const updatedQuestion = currentQuestion.setQuery(query);
    setCurrentQuestion(updatedQuestion);
    updateQuestion(updatedQuestion);
  };

  const handleRunQuery = () => {
    if (isRunnable) {
      runQuery();
    }
  };

  return (
    <>
      <QueryEditor
        query={currentQuestion.query()}
        uiState={uiState}
        onChangeQuery={onQueryChange}
        onChangeUiState={setUiState}
        onAcceptProposed={handleRunQuery}
        onRejectProposed={() => {}}
        height={hasVisualizeButton ? "calc(100% - 100px)" : undefined}
        extraEditorButton={
          hasVisualizeButton && runQuestionQuery && result && !result?.error ? (
            <VisualizeButton
              question={currentQuestion}
              isDirty={isDirty}
              isRunnable={isRunnable}
              isResultDirty
              updateQuestion={updateQuestion}
              runQuestionQuery={runQuestionQuery}
            />
          ) : undefined
        }
      />
    </>
  );
}
