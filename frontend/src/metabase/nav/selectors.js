import { createSelector } from "reselect";

export { getUser } from "metabase/selectors/user";

export const getPath = (state, props) => props.location.pathname;

export const getContext = createSelector(
  [getPath],
  path =>
    path.startsWith("/auth/")
      ? "auth"
      : path.startsWith("/setup/")
        ? "setup"
        : path.startsWith("/admin/") ? "admin" : path === "/" ? "home" : "main",
);
