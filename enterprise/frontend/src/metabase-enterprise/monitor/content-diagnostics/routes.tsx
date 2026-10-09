import { Outlet, Route, redirect } from "metabase/router";
import { useGetContentDiagnosticsCountsQuery } from "metabase-enterprise/api/content-diagnostics";

import {
  CrowdedContentPage,
  DuplicatedContentPage,
  EmptyContentPage,
  SlowContentPage,
  SparseContentPage,
  StaleContentPage,
} from "./pages";

export function ContentDiagnosticsSectionLayout() {
  useGetContentDiagnosticsCountsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  return <Outlet />;
}

export function getContentDiagnosticsRoutes() {
  return (
    <Route element={<ContentDiagnosticsSectionLayout />}>
      <Route index element={redirect("stale")} />
      <Route path="stale" element={<StaleContentPage />} />
      <Route path="duplicated" element={<DuplicatedContentPage />} />
      <Route path="slow" element={<SlowContentPage />} />
      <Route path="empty" element={<EmptyContentPage />} />
      <Route path="sparse" element={<SparseContentPage />} />
      <Route path="crowded" element={<CrowdedContentPage />} />
    </Route>
  );
}
