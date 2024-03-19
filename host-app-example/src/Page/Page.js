import { Welcome } from "../Welcome";
import { QuestionSearchDropdown } from "../QuestionSearchDropdown";
import { useState } from "react";
import { QueryVisualizationSdk } from "metabase-embedding-sdk";
import { FontSelector } from "../FontSelector";
import { LogoutButton } from "../Logout";
import { ShowVisualizationToggle } from "../ShowVisualizationToggle";

import "./Page.css";
import { StyleLeakFlag } from "../StyleLeakFlag/StyleLeakFlag";

export const Page = () => {
  const [question, setQuestion] = useState(null);
  const [showVisualizationSelector, setShowVisualizationSelector] =
    useState(false);

  return (
    <div className="tw-h-full tw-w-full tw-flex tw-flex-col">
      <div className="tw-p-5">
        <QuestionSearchDropdown
          selectedQuestion={question}
          setSelectedQuestion={setQuestion}
        />
      </div>
      <div className="tw-flex-1">
        {question ? (
          <div className="tw-w-full tw-h-full tw-flex tw-flex-col">
            <ShowVisualizationToggle
              onClick={() =>
                setShowVisualizationSelector(!showVisualizationSelector)
              }
              showVisualizationSelector={showVisualizationSelector}
              question={question}
            />
            <QueryVisualizationSdk
              showVisualizationSelector={showVisualizationSelector}
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
