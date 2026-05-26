import { useMemo } from "react";
import { type WithRouterProps, withRouter } from "react-router";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { useListDatabasesQuery } from "metabase/api";
import { connect } from "metabase/redux";
import type { AdminPath, State } from "metabase/redux/store";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { getUser } from "metabase/selectors/user";
import type { User } from "metabase-types/api";

import { AdminNavbar } from "../components/AdminNavbar";

import MainNavbar from "./MainNavbar";

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

function Navbar({ isOpen, user, location, params, adminPaths }: NavbarProps) {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default withRouter(connect(mapStateToProps)(Navbar));
