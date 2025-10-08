import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import { getIcon } from "metabase/lib/icon";
import { getName } from "metabase/lib/name";
import type { UrlableModel } from "metabase/lib/urls/modelToUrl";
import type { MenuItem } from "metabase-enterprise/documents/components/Editor/shared/MenuComponents";
import type {
  Database,
  MentionableUser,
  RecentItem,
  SearchResult,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import type { SuggestionModel } from "./types";

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

export function buildSearchModelMenuItems(
  searchModels: SuggestionModel[],
  onSelect: (model: SuggestionModel) => void,
): MenuItem[] {
  return searchModels.map((model) => {
    return {
      icon: getIcon({ model }).name,
      label: getTranslatedEntityName(model) || model,
      model,
      action: () => onSelect(model),
      hasSubmenu: true,
    };
  });
}

export function entityToUrlableModel<
  T extends {
    id: string | number;
    name?: string;
    common_name?: string;
    db_id?: number;
    database_id?: number;
  },
>(entity: T, model: SuggestionModel | null): UrlableModel {
  const result: UrlableModel = {
    id: entity.id as number, // it is string | number in reality, but then gets casted to a string in "modelToUrl"
    model: model || "",
    name: isMentionableUser(entity)
      ? entity.common_name
      : (entity.name as string),
  };

  if ("db_id" in entity && entity.db_id) {
    result.database = {
      id: entity.db_id,
    };
  }

  if ("database_id" in entity && entity.database_id) {
    result.database = { id: entity.database_id };
  }

  return result;
}

export function isMentionableUser(value: unknown): value is MentionableUser {
  return isObject(value) && typeof value.common_name === "string";
}
