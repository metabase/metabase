import { useMemo } from "react";
import { type WithRouterProps, withRouter } from "react-router";

import { useListDatabasesQuery } from "metabase/api";
import { getDashboard } from "metabase/dashboard/selectors";
import { AdminNavbar } from "metabase/nav/components/AdminNavbar";
import { MainNavbar } from "metabase/nav/containers/MainNavbar";
import { connect } from "metabase/redux";
import type { AdminPath, State, StoreDashboard } from "metabase/redux/store";
import { getAdminPaths } from "metabase/selectors/admin";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { getUser } from "metabase/selectors/user";
import type { User } from "metabase-types/api";

type NavbarProps = WithRouterProps & {
  isOpen: boolean;
  user: User | null;
  adminPaths: AdminPath[];
  dashboard?: StoreDashboard;
};

const mapStateToProps = (state: State) => ({
  isOpen: getIsNavbarOpen(state),
  user: getUser(state),
  adminPaths: getAdminPaths(state),
  // Can't use the dashboard entity loader instead.
  // The dashboard page uses DashboardsApi.get directly,
  // so we can't re-use data between these components.
  dashboard: getDashboard(state),
});

function NavbarInner({
  isOpen,
  user,
  location,
  params,
  adminPaths,
  dashboard,
}: NavbarProps) {
  useListDatabasesQuery();
  const isAdminApp = useMemo(
    () => location.pathname.startsWith("/admin/"),
    [location.pathname],
  );

  if (!user) {
    return null;
  }

  return isAdminApp ? (
    <AdminNavbar path={location.pathname} adminPaths={adminPaths} />
  ) : (
    <MainNavbar
      isOpen={isOpen}
      location={location}
      params={params}
      dashboard={dashboard}
    />
  );
}

export const Navbar = withRouter(connect(mapStateToProps)(NavbarInner));
