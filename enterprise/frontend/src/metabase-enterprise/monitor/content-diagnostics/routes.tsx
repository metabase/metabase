import { Route, redirect, withRouteProps } from "metabase/router";

import { StaleContentPage } from "./pages";

const RoutedStaleContentPage = withRouteProps(StaleContentPage);

export function getContentDiagnosticsRoutes() {
  return (
    <>
      <Route index element={redirect("stale")} />
      <Route path="stale" element={<RoutedStaleContentPage />} />
    </>
  );
}
