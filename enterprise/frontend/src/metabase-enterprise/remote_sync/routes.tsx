import { Route } from "metabase/router";
import { featureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

const worktreeListPage = () =>
  import(
    /* webpackChunkName: "data-studio-worktrees" */ "./pages/WorktreeListPage"
  ).then(({ WorktreeListPage }) => ({ Component: WorktreeListPage }));

export function getDataStudioRoutes() {
  return (
    <Route
      path="worktrees"
      lazy={featureGatedRoute("remote_sync", worktreeListPage)}
    />
  );
}
