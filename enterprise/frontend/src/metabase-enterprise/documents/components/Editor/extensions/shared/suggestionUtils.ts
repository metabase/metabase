import { getIcon } from "metabase/lib/icon";
import { getName } from "metabase/lib/name";
import type {
  Database,
  RecentItem,
  SearchModel,
  SearchResult,
} from "metabase-types/api";

import type { MenuItem } from "../../shared/MenuComponents";

export const filterRecents = (item: RecentItem, models: SearchModel[]) =>
  models.includes(item.model);

export function buildSearchMenuItems(
  searchResults: SearchResult[],
  onSelect: (result: SearchResult) => void,
): MenuItem[] {
  return searchResults.map((result) => {
    const iconData = getIcon({
      model: result.model,
      display: result.display,
    });
    return {
      icon: iconData.name,
      label: result.name,
      id: result.id,
      model: result.model,
      action: () => onSelect(result),
    };
  });
}

export function buildRecentsMenuItems(
  recents: Array<RecentItem>,
  onSelect: (recent: RecentItem) => void,
): MenuItem[] {
  return recents.map((recent) => {
    const iconData = getIcon(recent);
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
