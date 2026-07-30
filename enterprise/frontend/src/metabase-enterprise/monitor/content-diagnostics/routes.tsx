import { Route, redirect } from "metabase/router";

import { StaleContentPage } from "./pages";

export function getContentDiagnosticsRoutes() {
  return (
    <>
      <Route index element={redirect("stale")} />
      <Route path="stale" element={<StaleContentPage />} />
    </>
  );
}
