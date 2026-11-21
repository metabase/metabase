import { useDispatch, useSelector } from "metabase/redux";
import { openNavbar } from "metabase/redux/app";
import { getIsNavbarOpen } from "metabase/selectors/app";

import { NavToggleActionIcon } from "./NavToggleActionIcon";
import { useNavVariant } from "./use-nav-variant";

/**
 * PROTOTYPE: the "No top nav" variant's open-sidebar button, for page headers
 * that sit at the very top when the nav is closed (the query builder).
 * Renders nothing in other variants or while the nav is open.
 */
export function NavOpenButton() {
  const { variant } = useNavVariant();
  const isNavbarOpen = useSelector(getIsNavbarOpen);
  const dispatch = useDispatch();

  if (variant !== "no-top-nav" || isNavbarOpen) {
    return null;
  }

  return (
    <NavToggleActionIcon
      isNavbarOpen={false}
      onToggle={() => dispatch(openNavbar())}
    />
  );
}

/**
 * PROTOTYPE: pages whose own header carries `NavOpenButton`, so the "No top
 * nav" variant skips its slim top bar there: the query builder, for saved and
 * ad-hoc questions and models (not their detail pages, Ask, or research).
 */
export function isQueryBuilderPagePath(pathname: string): boolean {
  return (
    /^\/(question|model)(\/|$)/.test(pathname) &&
    !/^\/question\/(ask|research)(\/|$)/.test(pathname) &&
    !/\/detail(\/|$)/.test(pathname)
  );
}
