import _ from "underscore";

import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { type IconName, isValidIconName } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";

interface Item {
  id: string | number;
  icon: IconName;
  label: string;
  position: number;
}

export function getId(item: Item): Item["id"] {
  return item.id;
}

export function getItems(fields: Field[] = []): Item[] {
  return fields.map((field) => {
    const icon = field.icon();

    return {
      id: field.getId(),
      icon: isValidIconName(icon) ? icon : "empty",
      label: field.displayName() || NULL_DISPLAY_VALUE,
      position: field.position,
    };
  });
}

export function getItemsOrder(items: Item[]): Item["id"][] {
  return _.sortBy(items, (item) => item.position).map((item) => item.id);
}

export function sortItems(items: Item[], order: Item["id"][]) {
  const indexMap = Object.fromEntries(order.map((id, index) => [id, index]));

  return items.sort((a, b) => indexMap[a.id] - indexMap[b.id]);
}
