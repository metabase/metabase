import { Route, redirect } from "metabase/router";

import {
  DuplicatedContentPage,
  SlowContentPage,
  StaleContentPage,
} from "./pages";

export function getContentDiagnosticsRoutes() {
  return (
    <>
      <Route index element={redirect("stale")} />
      <Route path="stale" element={<StaleContentPage />} />
      <Route path="duplicated" element={<DuplicatedContentPage />} />
      <Route path="slow" element={<SlowContentPage />} />
    </>
  );
}
