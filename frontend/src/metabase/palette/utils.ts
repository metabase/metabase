import type { LocationDescriptor } from "history";
import type { MouseEvent } from "react";
import { t } from "ttag";
import _ from "underscore";

import type { ColorName } from "metabase/lib/colors/types";
import type { IconName } from "metabase/ui";
import type { RecentItem } from "metabase-types/api";

import { BASIC_ACTION_ORDER } from "./hooks/useCommandPaletteBasicActions";
import type { PaletteActionImpl } from "./types";

const BASIC_ACTION_ORDER_BY_NAME = BASIC_ACTION_ORDER.reduce<
  Record<string, number>
>((acc, actionName, index) => {
  acc[actionName] = index;
  return acc;
}, {});

export const processResults = (
  results: (string | PaletteActionImpl)[],
  searchTerm: string,
): (string | PaletteActionImpl)[] => {
  const groupedResults = _.groupBy(
    results.filter((r): r is PaletteActionImpl => !(typeof r === "string")),
    "section",
  );

  const actions = processSection(
    t`Actions`,
    groupedResults["basic"],
    BASIC_ACTION_ORDER_BY_NAME,
  );
  const search = processSection(t`Results`, groupedResults["search"]);
  const recent = processSection(t`Recents`, groupedResults["recent"]);
  const admin = processSection(t`Admin`, groupedResults["admin"]);
  const docs = processSection(t`Documentation`, groupedResults["docs"]);

  if (searchTerm.trim().length === 0) {
    return [...recent];
  }

  return [
    ...recent,
    // Get the first 5 actions, the first index is the section title
    ...actions.slice(0, 6),
    ...admin,
    ...search,
    ...docs,
  ];
};

export const processSection = (
  sectionName: string,
  items?: PaletteActionImpl[],
  sortOrder?: Record<string, number>,
) => {
  if (items && items.length > 0) {
    if (sortOrder) {
      const sortedItems = [...items].sort((a, b) => {
        const aOrder = sortOrder[a.id] ?? Number.MAX_SAFE_INTEGER;
        const bOrder = sortOrder[b.id] ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder;
      });

      return [sectionName, ...sortedItems];
    }
    return [sectionName, ...items];
  } else {
    return [];
  }
};

const actionIsStringOrDisabled = (action: string | PaletteActionImpl) =>
  typeof action === "string" || action.disabled;

export const navigateActionIndex = (
  actions: (string | PaletteActionImpl)[],
  index: number,
  diff: number,
): number => {
  if (
    actions.every((action) => typeof action === "string" || action.disabled)
  ) {
    return index;
  } else {
    return findClosestActionIndex(actions, index, diff);
  }
};

export const findClosestActionIndex = (
  actions: (string | PaletteActionImpl)[],
  index: number,
  diff: number,
): number => {
  if (index + diff < 0) {
    return findClosestActionIndex(actions, -1, 1);
  } else if (index + diff > actions.length - 1) {
    return findClosestActionIndex(actions, actions.length, -1);
  } else if (actionIsStringOrDisabled(actions[index + diff])) {
    if (diff < 0) {
      return findClosestActionIndex(actions, index, diff - 1);
    } else {
      return findClosestActionIndex(actions, index, diff + 1);
    }
  }

  return index + diff;
};

export const filterRecentItems: (items: RecentItem[]) => RecentItem[] = (
  items,
) => items.filter((item) => item.model !== "collection").slice(0, 10);

export const getCommandPaletteIcon = (
  item: PaletteActionImpl,
): { name: IconName; c: ColorName } => {
  const icon = {
    name: item.icon as IconName,
    c: item.extra?.iconColor || "brand",
  };

  return icon;
};

export const isAbsoluteURL = (url: string) =>
  url.startsWith("http://") || url.startsWith("https://");

export const locationDescriptorToURL = (
  locationDescriptor: LocationDescriptor,
) => {
  if (typeof locationDescriptor === "string") {
    return locationDescriptor;
  } else {
    const { pathname = "", query = null, hash = null } = locationDescriptor;
    const queryString = query
      ? "?" + new URLSearchParams(query).toString()
      : "";
    const hashString = hash ? "#" + hash : "";

    return `${pathname}${queryString}${hashString}`;
  }
};

export const isNormalClick = (e: MouseEvent): boolean =>
  !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey && e.button === 0;
