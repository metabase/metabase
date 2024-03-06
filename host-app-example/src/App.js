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
    "mb_Zhns2vrYNTIAAc/GHBuIoUshpysJ2laLWsZ9MbJavj0=",
};

const App = () => {
  /** @type {import("@mantine/core").MantineThemeOverride} */
  const theme = {
    colors: {
      brand: Array(10).fill("#E350CA"),
    },
  };

  return (
    <MetabaseProvider config={config} theme={theme}>
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
