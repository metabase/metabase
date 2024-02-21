import { MetabaseProvider } from "metabase-embedding-sdk";

import { Page } from "./Page";

const config = {
  metabaseInstanceUrl:
    process.env.REACT_APP_METABASE_INSTANCE_URL || "http://localhost:3000",
  font: "Inter",
  authType: "apiKey",
  // jwtProviderUri: "http://localhost:8081/sso/metabase",
  apiKey: "mb_ibHudja0H7LJiStzxaI1R1EUxlVSDCO9ywbkNY/0Mak=",
};

const App = () => (
  <MetabaseProvider config={config}>
    <Page />
  </MetabaseProvider>
);

export default App;
