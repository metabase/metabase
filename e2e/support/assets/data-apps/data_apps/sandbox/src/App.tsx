import {
  DataAppLink,
  DataAppRouter,
  useDataAppLocation,
} from "@metabase/embedding-sdk-react/data-app";
import type { ComponentType } from "react";

import { Isolation } from "./Isolation";
import { ProbesPage } from "./ProbesPage";
import { Sandbox } from "./Sandbox";

const ROUTES: Record<string, ComponentType> = {
  "/sandboxing": Sandbox,
  "/isolation": Isolation,
};

function Shell() {
  const { pathname } = useDataAppLocation();
  const Page = ROUTES[pathname] ?? ProbesPage;

  return (
    <div style={{ fontFamily: "sans-serif" }}>
      <nav style={{ padding: 16, display: "flex", gap: 16 }}>
        <DataAppLink to="/">Probes</DataAppLink>
        <DataAppLink to="/sandboxing">Sandbox</DataAppLink>
        <DataAppLink to="/isolation">Isolation</DataAppLink>
      </nav>
      <Page />
    </div>
  );
}

export default function App() {
  return (
    <DataAppRouter>
      <Shell />
    </DataAppRouter>
  );
}
