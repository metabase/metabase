import { MetabaseProvider } from "metabase-embedding-sdk";

import { Page } from "./Page";
import "./App.css";
import { LogoutButton } from "./Logout";

const config = {
  metabaseInstanceUrl:
    process.env.REACT_APP_METABASE_INSTANCE_URL || "http://localhost:3000",
  font: "Lato",
  jwtProviderUri: process.env.REACT_APP_JWT_PROVIDER_URI,
  apiKey: process.env.REACT_APP_API_KEY,
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
