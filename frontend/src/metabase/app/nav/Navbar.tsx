import { useMemo } from "react";
import { type WithRouterProps, withRouter } from "react-router";

import { useListDatabasesQuery } from "metabase/api";
import { AdminNavbar } from "metabase/nav/components/AdminNavbar";
import { MainNavbar } from "metabase/nav/containers/MainNavbar";
import { connect } from "metabase/redux";
import type { AdminPath, State } from "metabase/redux/store";
import { getAdminPaths } from "metabase/selectors/admin";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { getUser } from "metabase/selectors/user";
import type { User } from "metabase-types/api";

type NavbarProps = WithRouterProps & {
  isOpen: boolean;
  user: User | null;
  adminPaths: AdminPath[];
};

const mapStateToProps = (state: State) => ({
  isOpen: getIsNavbarOpen(state),
  user: getUser(state),
  adminPaths: getAdminPaths(state),
});

function NavbarInner({
  isOpen,
  user,
  location,
  params,
  adminPaths,
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
    <MainNavbar isOpen={isOpen} location={location} params={params} />
  );
}

export const Navbar = withRouter(connect(mapStateToProps)(NavbarInner));
