import { useState } from "react";
import {
  MetabaseProvider,
  QueryVisualizationSdk,
} from "metabase-embedding-sdk";
import { HelloName } from "./HelloName";
import { Welcome } from "./Welcome";
import { ChooseQuestionInput } from "./ChooseQuestionInput";
import { QueryVisualizationContainer } from "./QueryVisualizationContainer.styled";
import { AppBody, AppContainer, AppHeader } from "./App.styled";

function App() {
  const [questionId, setQuestionId] = useState(105);

  return (
    <MetabaseProvider
      apiUrl={"http://localhost:3000"}
      apiKey={"mb_sfmfeTfUONsMuMPbdpP2HOhSzS3cMFrSeDS9NNpsHn8="}
      font={"Oswald"}
    >
      <AppContainer>
        <AppHeader>
          <Welcome />
          <HelloName />
        </AppHeader>

        <AppBody>
        <ChooseQuestionInput
          questionId={questionId}
          setQuestionId={setQuestionId}
        />

        <QueryVisualizationContainer>
          <QueryVisualizationSdk questionId={questionId} />
        </QueryVisualizationContainer>
        </AppBody>
      </AppContainer>
    </MetabaseProvider>
  );
}

export default App;
