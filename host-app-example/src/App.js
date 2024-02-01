import { useState } from "react";
import {
  MetabaseProvider,
  QueryVisualizationSdk,
} from "metabase-embedding-sdk";

import "./App.css";
import { Test } from "./Test";


function App() {
  const [questionId, setQuestionId] = useState(105);
  const [userInput, setTempQuestionId] = useState(questionId);

  const onChangeQuestionId = e => {
    if (e.key === "Enter") {
      setQuestionId(userInput);
    }
  };

  return (
    <MetabaseProvider
      apiUrl={"http://localhost:3000"}
      apiKey={"mb_sfmfeTfUONsMuMPbdpP2HOhSzS3cMFrSeDS9NNpsHn8="}
      font={"Oswald"}
    >
      <div className="App">
        <header className="App-header">
          <p>Denis and Oisin are so cool!</p>
          <Test/>
        </header>

        <input
          value={userInput}
          onChange={e => setTempQuestionId(e.target.value)}
          onKeyDown={onChangeQuestionId}
        />

        <QueryVisualizationSdk questionId={questionId} />
      </div>
    </MetabaseProvider>
  );
}

export default App;
