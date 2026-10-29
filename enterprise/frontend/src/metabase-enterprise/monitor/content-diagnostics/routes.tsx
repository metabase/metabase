import { Route, redirect } from "metabase/router";

import {
  CrowdedContentPage,
  DuplicatedContentPage,
  EmptyContentPage,
  SlowContentPage,
  SparseContentPage,
  StaleContentPage,
} from "./pages";

export function getContentDiagnosticsRoutes() {
  return (
    <>
      <Route index element={redirect("stale")} />
      <Route path="stale" element={<StaleContentPage />} />
      <Route path="duplicated" element={<DuplicatedContentPage />} />
      <Route path="slow" element={<SlowContentPage />} />
      <Route path="empty" element={<EmptyContentPage />} />
      <Route path="sparse" element={<SparseContentPage />} />
      <Route path="crowded" element={<CrowdedContentPage />} />
    </>
  );
}
