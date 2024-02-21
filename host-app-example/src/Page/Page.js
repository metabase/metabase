import { Welcome } from "../Welcome";
import { QuestionSearchDropdown } from "../QuestionSearchDropdown";
import { useState } from "react";
import { QueryVisualizationSdk } from "metabase-embedding-sdk";
import { FontSelector } from "../FontSelector";
import { LogoutButton } from "../Logout";
import { ShowVisualizationToggle } from "../ShowVisualizationToggle";

import "./Page.css";

export const Page = () => {
  const [question, setQuestion] = useState(null);
  const [showVisualizationSelector, setShowVisualizationSelector] =
    useState(false);

  return (
    <div className="Page--container">
      <header className="Page--header">
        <Welcome />
        <LogoutButton />
      </header>

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
          <div>Select a question to display here.</div>
        )}
      </div>

      <footer className="Page--footer">
        <FontSelector />
      </footer>
    </div>
  );
};
