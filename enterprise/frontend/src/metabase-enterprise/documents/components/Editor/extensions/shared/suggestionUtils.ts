import { getIcon } from "metabase/lib/icon";
import { getName } from "metabase/lib/name";
import type {
  Database,
  RecentCollectionItem,
  RecentItem,
  SearchModel,
  SearchResult,
} from "metabase-types/api";

import type { MenuItem } from "../../shared/MenuComponents";

export const isRecentQuestion = (
  item: RecentItem,
): item is RecentCollectionItem & { model: "card" | "dataset" } =>
  item.model === "card" || item.model === "dataset";

export function buildSearchMenuItems(
  searchResults: SearchResult[],
  onSelect: (result: SearchResult) => void,
): MenuItem[] {
  return searchResults.map((result) => {
    const iconData = getIcon({
      model: result.model,
      // display is optional in SearchResult, pass through when present
      display: result.display ?? undefined,
    });
    return {
      icon: iconData.name,
      label: result.name,
      id: result.id,
      model: result.model as SearchModel,
      action: () => onSelect(result),
    };
  });
}

export function buildRecentsMenuItems(
  recents: Array<RecentCollectionItem & { model: "card" | "dataset" }>,
  onSelect: (recent: RecentCollectionItem) => void,
): MenuItem[] {
  return recents.map((recent) => {
    const iconData = getIcon({
      model: recent.model,
      display: recent.display ?? undefined,
    });
    return {
      icon: iconData.name,
      label: getName(recent),
      id: recent.id,
      model: recent.model as SearchModel,
      action: () => onSelect(recent),
    };
  });
}

export function buildDbMenuItems(
  dbs: Database[],
  onSelect: (db: Database) => void,
): MenuItem[] {
  return dbs.map((db) => {
    const iconData = getIcon({ model: "database" });
    return {
      icon: iconData.name,
      label: db.name,
      id: db.id,
      model: "database",
      action: () => onSelect(db),
    };
  });
}
