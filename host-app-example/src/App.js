import { MetabaseProvider } from "metabase-embedding-sdk";

import { Page } from "./Page";
import "./App.css";
import { LogoutButton } from "./Logout";

const config = {
  metabaseInstanceUrl:
    process.env.REACT_APP_METABASE_INSTANCE_URL || "http://localhost:3000",
  font: "Roboto Slab",
  jwtProviderUri: "http://localhost:8090/sso/metabase",
  // apiKey: "mb_//WK5lK5krDurdyjO/ZcoYQi50gTvUekNxFMR9N+HJk=",
};

const App = () => (
  <div className="App-container">
    <div className="App-header">
      <LogoutButton />
    </div>

    <MetabaseProvider config={config}>
      <div className="App-body">
        <Page />
      </div>
    </MetabaseProvider>
  </div>
);

export default App;
