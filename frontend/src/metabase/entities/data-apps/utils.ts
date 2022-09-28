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

function getChildNavItems(
  navItems: DataAppNavItem[],
  targetNavItem: DataAppNavItem,
  targetNavItemIndex: number,
): DataAppNavItem[] {
  const children: DataAppNavItem[] = [];

  const baseIndent = targetNavItem.indent || 0;

  for (let i = targetNavItemIndex + 1; i < navItems.length; i++) {
    const item = navItems[i];
    const indent = item.indent;

    // Top-level page
    if (!indent || indent === 0) {
      break;
    }

    if (indent > baseIndent) {
      children.push(item);
    } else {
      break;
    }
  }

  return children;
}

export function moveNavItems(
  navItems: DataAppNavItem[],
  oldIndex: number,
  newIndex: number,
  movedItem: DataAppNavItem,
): DataAppNavItem[] {
  const nextNavItems = [...navItems];
  const movedItems = [
    movedItem,
    ...getChildNavItems(navItems, movedItem, oldIndex),
  ];

  nextNavItems.splice(oldIndex, movedItems.length);

  const insertIndex =
    newIndex > nextNavItems.length
      ? Math.max(newIndex - movedItems.length + 1, 0)
      : newIndex;

  nextNavItems.splice(insertIndex, 0, ...movedItems);

  return nextNavItems;
}
