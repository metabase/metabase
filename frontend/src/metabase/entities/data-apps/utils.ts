import _ from "underscore";
import type {
  Collection,
  DataApp,
  DataAppNavItem,
  DataAppPageId,
  Dashboard,
} from "metabase-types/api";

export function getDataAppIcon(app?: DataApp) {
  return { name: "app" };
}

export function isDataAppCollection(collection: Collection) {
  return typeof collection.app_id === "number";
}

export function isTopLevelNavItem(navItem: DataAppNavItem) {
  return (!navItem.indent || navItem.indent === 0) && !navItem.hidden;
}

export function getDataAppHomePageId(dataApp: DataApp, pages: Dashboard[]) {
  if (dataApp.dashboard_id) {
    return dataApp.dashboard_id;
  }
  const navItem = dataApp.nav_items.find(isTopLevelNavItem);
  if (navItem) {
    return navItem.page_id;
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

export function getChildNavItems(
  navItems: DataAppNavItem[],
  pageId: DataAppPageId,
) {
  const targetIndex = navItems.findIndex(navItem => navItem.page_id === pageId);
  if (targetIndex === -1) {
    return [];
  }

  const targetNavItem = navItems[targetIndex];
  const targetIndent = targetNavItem.indent || 0;

  const navItemsAfterTarget = navItems.slice(targetIndex + 1);

  const nextNavItemWithSameIndentIndex = navItemsAfterTarget.findIndex(
    navItem => (navItem.indent || 0) === targetIndent,
  );

  const endIndex =
    nextNavItemWithSameIndentIndex === -1
      ? undefined
      : nextNavItemWithSameIndentIndex;

  return navItemsAfterTarget.slice(0, endIndex);
}

export function getPreviousNavItem(
  navItems: DataAppNavItem[],
  pageId: DataAppPageId,
): DataAppNavItem | null {
  const navItemIndex = navItems.findIndex(
    navItem => navItem.page_id === pageId,
  );

  if (navItemIndex === -1) {
    return navItems[navItems.length - 1] || null;
  }

  const navItemsBeforeTarget = navItems.slice(0, navItemIndex);
  const previousNavItem = _.findLastIndex(
    navItemsBeforeTarget,
    isTopLevelNavItem,
  );

  return navItemsBeforeTarget[previousNavItem] || null;
}
