import { useMemo } from "react";
import { type WithRouterProps, withRouter } from "react-router";

import { useListDatabasesQuery } from "metabase/api";
import { getDashboard } from "metabase/dashboard/selectors";
import { AdminNavbar } from "metabase/nav/components/AdminNavbar";
import MainNavbar from "metabase/nav/containers/MainNavbar";
import { connect } from "metabase/redux";
import type { AdminPath, State } from "metabase/redux/store";
import { getAdminPaths } from "metabase/selectors/admin";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { getUser } from "metabase/selectors/user";
import type { Dashboard, User } from "metabase-types/api";

type NavbarProps = WithRouterProps & {
  isOpen: boolean;
  user: User | null;
  adminPaths: AdminPath[];
  dashboard?: Dashboard;
};

const mapStateToProps = (state: State) => ({
  isOpen: getIsNavbarOpen(state),
  user: getUser(state),
  adminPaths: getAdminPaths(state),
  // Can't use the dashboard entity loader instead.
  // The dashboard page uses DashboardsApi.get directly,
  // so we can't re-use data between these components.
  // The store dashboard shape differs from the API Dashboard, but downstream
  // consumers tolerate it — same suppression as the original MainNavbar wiring.
  dashboard: getDashboard(state) as Dashboard | undefined,
});

function Navbar({
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default withRouter(connect(mapStateToProps)(Navbar));
