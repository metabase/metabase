import { useState } from "react";
import {
  MetabaseProvider,
  QueryVisualizationSdk,
} from "metabase-embedding-sdk";

import { HelloName } from "./HelloName";
import { Welcome } from "./Welcome";
import { ChooseQuestionInput } from "./ChooseQuestionInput";
import "./App.css";

function App() {
  const [questionId, setQuestionId] = useState(77);
  const [apiKey, setApiKey] = useState(
    "mb_FqhtoYzE5yotRQY/awukXR5O8OQpLiz1agJK4ucOCdk=",
  );
  const [font, setFont] = useState("Oswald");

  return (
    <div>
      <ChooseQuestionInput
        questionId={questionId}
        setQuestionId={setQuestionId}
        apiKey={apiKey}
        setApiKey={setApiKey}
        font={font}
        setFont={setFont}
      />

      <MetabaseProvider
        apiUrl={"http://localhost:3000"}
        apiKey={apiKey}
        font={font}
      >
        <div className="App-container">
          <div className="App-header">
            <Welcome />
            <HelloName />
          </div>

          <div className="App-body">
            <div className="QueryVisualization-container">
              <QueryVisualizationSdk questionId={questionId} font={font} />
            </div>
          </div>
        </div>
      </MetabaseProvider>
    </div>
  );
}

export default App;
