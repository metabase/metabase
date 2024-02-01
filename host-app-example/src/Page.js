import { Welcome } from "./Welcome";
import { QuestionList } from "./QuestionList";
import { useState } from "react";
import { QueryVisualizationSdk } from "metabase-embedding-sdk";

export const Page = () => {
  const [questionId, setQuestionId] = useState(null);

  return (
    <>
      <Welcome />
      <QuestionList
        className="QuestionsList"
        selectedQuestionId={questionId}
        setSelectedQuestionId={setQuestionId}
      />

      <div className="QueryVisualization-container">
        {questionId ? (
          <QueryVisualizationSdk questionId={questionId} />
        ) : (
          <div className="QueryVisualization-placeholder">
            Select a question to display here.
          </div>
        )}
      </div>
    </>
  );
};
