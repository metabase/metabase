import { useState } from "react";
import {
  MetabaseProvider,
  QueryVisualizationSdk,
} from "metabase-embedding-sdk";
import { HelloName } from "./HelloName";
import { Welcome } from "./Welcome";
import { QuestionList } from "./QuestionList";
import "./App.css";

function App() {
  const [questionId, setQuestionId] = useState(105);

  return (
    <MetabaseProvider
      apiUrl={"http://localhost:3000"}
      apiKey={"mb_sfmfeTfUONsMuMPbdpP2HOhSzS3cMFrSeDS9NNpsHn8="}
    >
      <div class="App-container">
        <div class="App-header">
          <Welcome />
          <HelloName />
        </div>

        <div class="App-body">
          <QuestionList
            className="QuestionList-container"
            selectedQuestionId={questionId}
            setSelectedQuestionId={setQuestionId}
          />

          <div class="QueryVisualization-container">
            <QueryVisualizationSdk questionId={questionId} />
          </div>
        </div>
      </div>
    </MetabaseProvider>
  );
}

export default App;
