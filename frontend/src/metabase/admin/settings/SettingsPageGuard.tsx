import {
  getSettingsSlug,
  getUserIsAdmin,
  isSettingsManagerPath,
} from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { Navigate, Outlet, useLocation } from "metabase/router";

export function SettingsPageGuard() {
  const isAdmin = useSelector(getUserIsAdmin);
  const { pathname } = useLocation();
  return isAdmin || isSettingsManagerPath(getSettingsSlug(pathname)) ? (
    <Outlet />
  ) : (
    <Navigate to="/unauthorized" replace />
  );
}
