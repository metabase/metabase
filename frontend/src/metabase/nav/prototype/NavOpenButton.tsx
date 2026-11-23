import { useDispatch, useSelector } from "metabase/redux";
import { openNavbar } from "metabase/redux/app";
import { useLocation } from "metabase/router";
import { getIsNavbarOpen } from "metabase/selectors/app";

import { NavToggleActionIcon } from "./NavToggleActionIcon";
import { isModernNav, useNavVariant } from "./use-nav-variant";

/**
 * PROTOTYPE: the "Modern nav" variants' open-sidebar button, for page headers
 * that sit at the very top when the nav is closed. Renders nothing in other
 * variants, while the nav is open, or on pages that keep the nav-closed bar
 * (which carries its own button).
 */
export function NavOpenButton() {
  const { variant } = useNavVariant();
  const isNavbarOpen = useSelector(getIsNavbarOpen);
  const dispatch = useDispatch();
  const { pathname } = useLocation();

  if (!isModernNav(variant) || isNavbarOpen || !hasOwnNavOpenButton(pathname)) {
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
 * nav" variant skips its slim top bar there: the query builder, for ad-hoc
 * questions and models (not saved questions, which keep the bar for their
 * breadcrumbs, nor detail pages or research), the Ask page, Metabot
 * conversation pages, metric pages, and the metrics explorer.
 */
export function hasOwnNavOpenButton(pathname: string): boolean {
  const isQueryBuilder =
    /^\/(question|model)(\/|$)/.test(pathname) &&
    !/^\/question\/(ask|research)(\/|$)/.test(pathname) &&
    !/^\/question\/\d+/.test(pathname) &&
    !/\/detail(\/|$)/.test(pathname);
  const isAsk = /^\/question\/ask(\/|$)/.test(pathname);
  const isConversation = pathname.startsWith("/metabot/conversation/");
  const isMetric = pathname.startsWith("/metric/");
  const isMetricsExplorer = /^\/explore(\/|$)/.test(pathname);
  return (
    isQueryBuilder || isAsk || isConversation || isMetric || isMetricsExplorer
  );
}

/**
 * PROTOTYPE: pages where "Modern nav - C" always shows the breadcrumb bar,
 * nav open or closed: collections, dashboards, documents and saved
 * questions.
 */
export function hasPinnedBreadcrumbBar(pathname: string): boolean {
  return /^\/(collection|dashboard|document)\/|^\/question\/\d+/.test(pathname);
}
