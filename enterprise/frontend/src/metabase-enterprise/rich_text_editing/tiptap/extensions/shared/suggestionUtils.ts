import { getIcon } from "metabase/lib/icon";
import { getName } from "metabase/lib/name";
import type { MenuItem } from "metabase-enterprise/documents/components/Editor/shared/MenuComponents";
import type { SuggestionModel } from "metabase-enterprise/documents/components/Editor/types";
import type {
  Database,
  MentionableUser,
  RecentItem,
  SearchResult,
} from "metabase-types/api";

export const filterRecents = (item: RecentItem, models: SuggestionModel[]) =>
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
  recents: RecentItem[],
  onSelect: (recent: RecentItem) => void,
): MenuItem[] {
  return recents.map((recent) => {
    const iconData = getIcon(recent);
    return {
      icon: iconData.name,
      label: getName(recent),
      id: recent.id,
      model: recent.model as SuggestionModel,
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

export function buildUserMenuItems(
  users: MentionableUser[],
  onSelect: (user: MentionableUser) => void,
): MenuItem[] {
  return users.map((user) => {
    return {
      icon: "unknown",
      label: user.common_name,
      id: user.id,
      model: "user",
      action: () => onSelect(user),
    };
  });
}
