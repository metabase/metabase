import { t } from "ttag";
import _ from "underscore";

import type { RecentItem } from "metabase-types/api";

import type { PaletteActionImpl } from "./types";

export const processResults = (
  results: (string | PaletteActionImpl)[],
): (string | PaletteActionImpl)[] => {
  const groupedResults = _.groupBy(
    results.filter((r): r is PaletteActionImpl => !(typeof r === "string")),
    "section",
  );

  const actions = processSection(t`Actions`, groupedResults["basic"]);
  const search = processSection(t`Search results`, groupedResults["search"]);
  const recent = processSection(t`Recent items`, groupedResults["recent"]);
  const admin = processSection(t`Admin`, groupedResults["admin"]);
  const docs = processSection(t`Documentation`, groupedResults["docs"]);

  return [...recent, ...actions.slice(0, 6), ...admin, ...search, ...docs];
};

export const processSection = (
  sectionName: string,
  items?: PaletteActionImpl[],
) => {
  if (items && items.length > 0) {
    return [sectionName, ...items];
  } else {
    return [];
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
  } else if (typeof actions[index + diff] === "string") {
    if (diff < 0) {
      return findClosestActionIndex(actions, index, diff - 1);
    } else {
      return findClosestActionIndex(actions, index, diff + 1);
    }
  }

  return index + diff;
};

export const filterRecentItems: (items: RecentItem[]) => RecentItem[] = items =>
  items.filter(item => item.model !== "collection").slice(0, 5);
