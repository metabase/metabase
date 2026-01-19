import type { Location } from "history";
import { useMemo } from "react";
import _ from "underscore";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { Databases } from "metabase/entities/databases";
import { connect } from "metabase/lib/redux";
import {
  useCompatLocation,
  useCompatParams,
} from "metabase/routing/compat";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { getUser } from "metabase/selectors/user";
import type { User } from "metabase-types/api";
import type { AdminPath, State } from "metabase-types/store";

import { AdminNavbar } from "../components/AdminNavbar";

import MainNavbar from "./MainNavbar";

type NavbarProps = {
  isOpen: boolean;
  user: User;
  adminPaths: AdminPath[];
};

const mapStateToProps = (state: State) => ({
  isOpen: getIsNavbarOpen(state),
  user: getUser(state),
  adminPaths: getAdminPaths(state),
});

function Navbar({ isOpen, user, adminPaths }: NavbarProps) {
  const compatLocation = useCompatLocation();
  const params = useCompatParams();

  // Cast to v3 Location type for compatibility
  const location = compatLocation as unknown as Location;

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
export default _.compose(
  Databases.loadList({
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps),
)(Navbar);
