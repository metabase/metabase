import { Route } from "metabase/router";

const worktreeListPage = () =>
  import(
    /* webpackChunkName: "data-studio-worktrees" */ "./pages/WorktreeListPage"
  ).then(({ WorktreeListPage }) => ({ Component: WorktreeListPage }));

export function getDataStudioRoutes() {
  return <Route path="worktrees" lazy={worktreeListPage} />;
}
