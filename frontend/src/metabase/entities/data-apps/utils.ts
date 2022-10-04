import _ from "underscore";
import type {
  Collection,
  DataApp,
  DataAppNavItem,
  DataAppNavItemWithChildren,
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

export function isTopLevelNavItem(navItem: DataAppNavItem) {
  return typeof navItem.indent !== "number" || navItem.indent === 0;
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
    return isTopLevelNavItem(maybeParentNavItem);
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

export function isSameNavItem(i1: DataAppNavItem, i2: DataAppNavItem) {
  return i1.page_id === i2.page_id;
}

function getChildNavItems(
  navItems: DataAppNavItem[],
  targetNavItem: DataAppNavItem,
  targetNavItemIndex?: number,
): DataAppNavItem[] {
  const children: DataAppNavItem[] = [];

  const baseIndent = targetNavItem.indent || 0;

  const startingIndex =
    targetNavItemIndex ||
    navItems.findIndex(item => isSameNavItem(item, targetNavItem));

  for (let i = startingIndex + 1; i < navItems.length; i++) {
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

export function groupNavItems(
  navItems: DataAppNavItem[],
): DataAppNavItemWithChildren[] {
  const topLevelItems = navItems.filter(isTopLevelNavItem);
  return topLevelItems.map(
    item =>
      ({
        ...item,
        children: getChildNavItems(navItems, item),
      } as DataAppNavItemWithChildren),
  );
}

export function moveNavItems(
  navItems: DataAppNavItem[],
  oldIndex: number,
  newIndex: number,
  movedItem: DataAppNavItem,
): DataAppNavItem[] {
  const originalNavItem = navItems[oldIndex];

  const nextNavItems = [...navItems];
  const children = getChildNavItems(navItems, originalNavItem, oldIndex);
  let movedItems = [movedItem, ...children];

  const originalIndent = originalNavItem.indent || 0;
  const nextIndent = movedItem.indent || 0;
  if (nextIndent > originalIndent) {
    movedItems = [
      movedItem,
      ...children.map(child => ({
        ...child,
        indent: (child.indent || 0) + 1,
      })),
    ];
  } else if (nextIndent < originalIndent) {
    movedItems = [
      movedItem,
      ...children.map(child => ({
        ...child,
        indent: nextIndent + 1,
      })),
    ];
  }

  nextNavItems.splice(oldIndex, movedItems.length);

  const insertIndex =
    newIndex > nextNavItems.length
      ? Math.max(newIndex - movedItems.length + 1, 0)
      : newIndex;

  // console.log({
  //   insertIndex,
  //   movedItems,
  //   originalNavItems: navItems,
  //   itemsBeforeInsert: nextNavItems,
  // });

  nextNavItems.splice(insertIndex, 0, ...movedItems);

  // nextNavItems[0].indent = 0;

  return nextNavItems;
}
