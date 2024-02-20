import { Welcome } from "./Welcome";
import { QuestionList } from "./QuestionList";
import { useState } from "react";
import { QueryVisualizationSdk } from "metabase-embedding-sdk";
import { FontSelector } from "./FontSelector/FontSelector";

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

      <FontSelector />

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
