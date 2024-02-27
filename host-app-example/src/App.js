import { MetabaseProvider } from "metabase-embedding-sdk";

import { Page } from "./Page";
import {Outlet} from "react-router-dom";

const config = {
  metabaseInstanceUrl:
    process.env.REACT_APP_METABASE_INSTANCE_URL || "http://localhost:3000",
  font: "Inter",
  authType: "apiKey",
  // jwtProviderUri: "http://localhost:8081/sso/metabase",
  apiKey: "mb_Sx6DGYlYiJgDVrwRhfBt29PsrmnXpJQg3pnbJqxT52M=",
};

const App = () => (
  <MetabaseProvider config={config}>
    <Outlet />
  </MetabaseProvider>
);

export default App;
