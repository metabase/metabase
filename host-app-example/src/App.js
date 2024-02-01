import { useState } from "react";
import { MetabaseProvider } from "metabase-embedding-sdk";

import { ChooseQuestionInput } from "./ChooseQuestionInput";
import { Page } from "./Page";
import "./App.css";

function App() {
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
          <Page />
        </div>
      </MetabaseProvider>
    </div>
  );
}

export default App;
