import { IndexRedirect, Route } from "react-router";

import { StaleContentPage } from "./pages";

export function getContentDiagnosticsRoutes() {
  return (
    <>
      <IndexRedirect to="stale" />
      <Route path="stale" component={StaleContentPage} />
    </>
  );
}
