import type { Location } from "history";
import { useMemo } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import _ from "underscore";

import { getAdminPaths } from "metabase/admin/app/selectors";
import Database from "metabase/entities/databases";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { getUser } from "metabase/selectors/user";
import type { User } from "metabase-types/api";
import type { AdminPath, State } from "metabase-types/store";

import { AdminNavbar } from "../components/AdminNavbar";

import MainNavbar from "./MainNavbar";

type NavbarProps = {
  isOpen: boolean;
  user: User;
  location: Location;
  params: Record<string, unknown>;
  adminPaths: AdminPath[];
};

const mapStateToProps = (state: State) => ({
  isOpen: getIsNavbarOpen(state),
  user: getUser(state),
  adminPaths: getAdminPaths(state),
});

function Navbar({ isOpen, user, location, params, adminPaths }: NavbarProps) {
  const isAdminApp = useMemo(
    () => location.pathname.startsWith("/admin/"),
    [location.pathname],
  );

  if (!user) {
    return null;
  }

  return isAdminApp ? (
    <AdminNavbar user={user} path={location.pathname} adminPaths={adminPaths} />
  ) : (
    <MainNavbar isOpen={isOpen} location={location} params={params} />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Database.loadList({
    loadingAndErrorWrapper: false,
  }),
  withRouter,
  connect(mapStateToProps),
)(Navbar);
