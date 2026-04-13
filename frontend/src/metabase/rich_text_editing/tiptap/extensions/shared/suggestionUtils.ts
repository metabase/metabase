import { match } from "ts-pattern";

import type { MenuItem } from "metabase/documents/components/Editor/shared/MenuComponents";
import type { MetabaseProtocolEntityModel } from "metabase/metabot/utils/links";
import type { UrlableModel } from "metabase/utils/urls/modelToUrl";
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

export function mbProtocolModelToSuggestionModel(inputModel: string): string {
  // dom nodes record strings and it's better to not to error the input with invalid
  // data. casting here still afford some amount of internal type awareness as these
  // two types might diverge in the future.
  const model: SuggestionModel = match(
    inputModel as MetabaseProtocolEntityModel,
  )
    .with("model", () => "dataset" as const)
    .with("question", () => "card" as const)
    .otherwise((x) => x);

  return model;
}

export function getBrowseAllItemIndex(
  menuItemsLength: number,
  canCreateNewQuestion?: boolean,
): number {
  return canCreateNewQuestion ? menuItemsLength + 1 : menuItemsLength;
}
