import { InteractiveQuestionSdk } from "metabase-embedding-sdk";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { QuestionSearchDropdown } from "../QuestionSearchDropdown";
import { ShowVisualizationToggle } from "../ShowVisualizationToggle";

import "./Page.css";

export const Page = () => {
  let { questionId } = useParams();

  const [question, setQuestion] = useState(
    questionId ? { id: questionId } : null,
  );
  const [showVisualizationSelector, setShowVisualizationSelector] =
    useState(false);

  console.log("question", question);

  return (
    <div className="tw-h-full tw-w-full tw-flex tw-flex-col">
      <div className="tw-p-5">
        <QuestionSearchDropdown
          selectedQuestion={question}
          setSelectedQuestion={setQuestion}
        />
      </div>
      <div className="tw-flex-1">
        <h1>hello from host app</h1>
        {question ? (
          <div className="tw-w-full tw-h-full tw-flex tw-flex-col">
            <ShowVisualizationToggle
              onClick={() =>
                setShowVisualizationSelector(!showVisualizationSelector)
              }
              showVisualizationSelector={showVisualizationSelector}
              question={question}
            />
            <InteractiveQuestionSdk
              // showVisualizationSelector={showVisualizationSelector}
              questionId={question.id}
            />
          </div>
        ) : (
          <div className="tw-grid tw-place-items-center tw-h-full tw-font-bold tw-text-gray-400 tw-text-3xl">
            Select a question to display here.
          </div>
        )}
      </div>
    </div>
  );
};
