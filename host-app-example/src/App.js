import { MetabaseProvider } from "metabase-embedding-sdk";

import { Page } from "./Page";
import "./App.css";
import { LogoutButton } from "./Logout";

const App = () => (
  <div className="App-container">
    <div className="App-header">
      <LogoutButton />
    </div>

    <MetabaseProvider apiUrl={"http://localhost:3000"}>
      <div className="App-body">
        <Page />
      </div>
    </MetabaseProvider>
  </div>
);

export default App;
