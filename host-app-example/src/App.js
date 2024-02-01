import { useState } from "react";
import {  
  QueryVisualizationSdk,
} from "metabase-embedding-sdk";
import { HelloName } from "./HelloName";
import { Welcome } from "./Welcome";
import { QuestionList } from "./QuestionList";
import "./App.css";

function App() {
  const [questionId, setQuestionId] = useState(null);

  return (
    <div className="App-container">
      <div className="App-header">
        <Welcome />
        <HelloName />
      </div>

      <div className="App-body">
        <QuestionList
          className="QuestionList-container"
          selectedQuestionId={questionId}
          setSelectedQuestionId={setQuestionId}
        />

        <div className="QueryVisualization-container">
          {questionId ? (
            <QueryVisualizationSdk
              questionId={questionId}
            />
          ) : (
            <div className="QueryVisualization-placeholder">
              Select a question to display here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
