import { useState } from "react";
import {  
  QueryVisualizationSdk,
} from "metabase-embedding-sdk";
import { HelloName } from "./HelloName";
import { Welcome } from "./Welcome";
import { QuestionList } from "./QuestionList";
import "./App.css";

function App() {
  const [questionId, setQuestionId] = useState(105);

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
          <QueryVisualizationSdk questionId={questionId} />
        </div>
      </div>
    </div>
  );
}

export default App;
