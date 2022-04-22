import React, { useMemo } from "react";
import _ from "underscore";
import { Location } from "history";
import { connect } from "react-redux";
import { withRouter } from "react-router";

import Database from "metabase/entities/databases";
import { getIsNavbarOpen } from "metabase/redux/app";
import { getUser } from "metabase/selectors/user";

import { User } from "metabase-types/api";
import { State } from "metabase-types/store";

import { AdminNavbar } from "../components/AdminNavbar";
import MainNavbar from "./MainNavbar";

type NavbarProps = {
  isOpen: boolean;
  user: User;
  location: Location;
  params: Record<string, unknown>;
};

const mapStateToProps = (state: State) => ({
  isOpen: getIsNavbarOpen(state),
  user: getUser(state),
});

function Navbar({ isOpen, user, location, params }: NavbarProps) {
  const isAdminApp = useMemo(() => location.pathname.startsWith("/admin/"), [
    location.pathname,
  ]);

  if (!user) {
    return null;
  }

  return isAdminApp ? (
    <AdminNavbar user={user} path={location.pathname} />
  ) : (
    <MainNavbar isOpen={isOpen} location={location} params={params} />
  );
}

export default _.compose(
  Database.loadList({
    loadingAndErrorWrapper: false,
  }),
  withRouter,
  connect(mapStateToProps),
)(Navbar);
