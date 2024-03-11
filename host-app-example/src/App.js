import { MetabaseProvider } from "metabase-embedding-sdk";

import { Outlet } from "react-router-dom";
import { Welcome } from "./Welcome";
import { LogoutButton } from "./Logout";
import { FontSelector } from "./FontSelector";
import { StyleLeakFlag } from "./StyleLeakFlag/StyleLeakFlag";
import { ViewToggle } from "./ViewToggle/ViewToggle";

const config = {
  metabaseInstanceUrl:
    process.env.REACT_APP_METABASE_INSTANCE_URL || "http://localhost:3000",
  font: "Inter",
  authType: "apiKey",
  // jwtProviderUri: "http://localhost:8081/sso/metabase",
  apiKey:
    process.env.REACT_APP_API_KEY ||
    "mb_69LT30xYbivFLUHLGRTN/5yK00yrT07zCbz/2smEiCI=",
};

const App = () => {
  return (
    <MetabaseProvider config={config}>
      <div className="Page--container">
        <header className="Page--header">
          <Welcome />
          <ViewToggle />
          <LogoutButton />
        </header>

        <div className="tw-flex-1 tw-overflow-scroll">
          <Outlet />
        </div>

        <footer className="Page--footer">
          <FontSelector />
          <StyleLeakFlag />
        </footer>
      </div>
    </MetabaseProvider>
  );
};

export default App;
