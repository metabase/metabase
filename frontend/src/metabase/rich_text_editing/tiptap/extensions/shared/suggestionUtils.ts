import { match } from "ts-pattern";

import type { MenuItem } from "metabase/rich_text_editing/tiptap/extensions/shared/MenuComponents";
import type { MetabaseProtocolEntityModel } from "metabase/urls";
import type { UrlableModel } from "metabase/urls/modelToUrl";
import type { MentionableUser, RecentItem } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import type { SuggestionModel } from "./types";

export const filterRecents = (item: RecentItem, models: SuggestionModel[]) =>
  models.includes(item.model);

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
    // Unjustified type cast. FIXME
    id: entity.id as number, // it is string | number in reality, but then gets casted to a string in "modelToUrl"
    model: model || "",
    name: isMentionableUser(entity)
      ? entity.common_name
      : // Unjustified type cast. FIXME
        (entity.name as string),
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

export function mbProtocolModelToSuggestionModel(
  model: MetabaseProtocolEntityModel,
): SuggestionModel {
  return match(model)
    .with("model", () => "dataset" as const)
    .with("question", () => "card" as const)
    .with(
      "collection",
      "dashboard",
      "database",
      "document",
      "measure",
      "metric",
      "segment",
      "table",
      "transform",
      (model) => model,
    )
    .exhaustive();
}

export function getBrowseAllItemIndex(
  menuItemsLength: number,
  canCreateNewQuestion?: boolean,
): number {
  return canCreateNewQuestion ? menuItemsLength + 1 : menuItemsLength;
}
