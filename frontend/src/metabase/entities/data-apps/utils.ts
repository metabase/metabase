import _ from "underscore";
import type {
  Collection,
  DataApp,
  DataAppNavItem,
  DataAppPageId,
  Dashboard,
} from "metabase-types/api";

export function getDataAppIcon(app?: DataApp) {
  return { name: "star" };
}

export function isDataAppCollection(collection: Collection) {
  return typeof collection.app_id === "number";
}

export function getDataAppHomePageId(dataApp: DataApp, pages: Dashboard[]) {
  if (dataApp.dashboard_id) {
    return dataApp.dashboard_id;
  }
  const [firstPage] = _.sortBy(pages, "name");
  return firstPage?.id;
}

function isParentPage(
  targetPageIndent: number,
  maybeParentNavItem: DataAppNavItem,
) {
  if (maybeParentNavItem.hidden) {
    return false;
  }

  // For `indent: 1` the expected parent indent is 0.
  // But it can be coming as `undefined` from the API,
  // so we need to ensure we accept both `undefined` and 0.
  if (targetPageIndent === 1) {
    return !maybeParentNavItem.indent || maybeParentNavItem.indent === 0;
  }

  return maybeParentNavItem.indent === targetPageIndent - 1;
}

export function getParentDataAppPageId(
  pageId: DataAppPageId,
  navItems: DataAppNavItem[],
): DataAppPageId | null {
  const pageIndex = navItems.findIndex(navItem => navItem.page_id === pageId);
  if (pageIndex === -1) {
    return null;
  }

  const { indent } = navItems[pageIndex];

  // Top-level page
  if (typeof indent !== "number" || indent === 0) {
    return null;
  }

  const pagesBeforeTarget = navItems.slice(0, pageIndex);
  const parentPageIndex = _.findLastIndex(pagesBeforeTarget, navItem =>
    isParentPage(indent, navItem),
  );

  return pagesBeforeTarget[parentPageIndex]?.page_id || null;
}
