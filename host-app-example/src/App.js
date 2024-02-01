import { useState } from "react";
import {
  MetabaseProvider,
  QueryVisualizationSdk,
} from "metabase-embedding-sdk";

import { Welcome } from "./Welcome";
import { ChooseQuestionInput } from "./ChooseQuestionInput";
import { QuestionList } from "./QuestionList";
import "./App.css";

function App() {
  const [questionId, setQuestionId] = useState(null);
  const [apiKey, setApiKey] = useState(
    "mb_FqhtoYzE5yotRQY/awukXR5O8OQpLiz1agJK4ucOCdk=",
  );
  const [font, setFont] = useState("Oswald");

  return (
    <div className="App-container">
      <div className="App-header">
        <ChooseQuestionInput
          apiKey={apiKey}
          setApiKey={setApiKey}
          font={font}
          setFont={setFont}
        />
      </div>

      <MetabaseProvider
        apiUrl={"http://localhost:3000"}
        apiKey={apiKey}
        font={font}
      >
        <div className="App-body">
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
        </div>
      </MetabaseProvider>
    </div>
  );
}

export default App;
