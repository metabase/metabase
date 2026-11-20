import { lazyModalRoute } from "metabase/common/components/ModalRoute";
import type { RouteObject } from "metabase/router";

/**
 * The dashboard, in its own chunk. Its three modal children defer separately, so
 * opening one does not depend on the page chunk having arrived.
 */
export const dashboardApp = () =>
  import(
    /* webpackChunkName: "dashboard" */ "metabase/dashboard/containers/DashboardApp/DashboardApp"
  ).then(({ DashboardApp }) => ({ Component: DashboardApp }));

export const dashboardMoveModal = () =>
  import(
    /* webpackChunkName: "dashboard-move-modal" */ "metabase/dashboard/components/DashboardMoveModal"
  ).then(({ DashboardMoveModalConnected }) => DashboardMoveModalConnected);

export const dashboardCopyModal = () =>
  import(
    /* webpackChunkName: "dashboard-copy-modal" */ "metabase/dashboard/components/DashboardCopyModal"
  ).then(({ DashboardCopyModalConnected }) => DashboardCopyModalConnected);

export const dashboardArchiveModal = () =>
  import(
    /* webpackChunkName: "dashboard-archive-modal" */ "metabase/dashboard/containers/ArchiveDashboardModal"
  ).then(
    ({ ArchiveDashboardModalConnected }) => ArchiveDashboardModalConnected,
  );

export const getDashboardRoute = (): RouteObject => ({
  path: "dashboard/:slug",
  lazy: dashboardApp,
  children: [
    lazyModalRoute("move", dashboardMoveModal, { noWrap: true }),
    lazyModalRoute("copy", dashboardCopyModal, { noWrap: true }),
    lazyModalRoute("archive", dashboardArchiveModal, { noWrap: true }),
  ],
});
