import _ from "underscore";

import type { DragEndEvent } from "metabase/core/components/Sortable";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { type IconName, isValidIconName } from "metabase/ui";
import type { Field } from "metabase-types/api";

interface Item {
  id: DragEndEvent["id"];
  icon: IconName;
  label: string;
  position: number;
}

export function getId(item: Item): Item["id"] {
  return item.id;
}

export function getItems(fields: Field[] = []): Item[] {
  return fields.map((field) => {
    const icon = getFieldIcon(field);

    return {
      id: getFieldId(field),
      icon: isValidIconName(icon) ? icon : "empty",
      label: getFieldDisplayName(field) || NULL_DISPLAY_VALUE,
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

function getFieldId(field: Field): string | number {
  if (Array.isArray(field.id)) {
    return field.id[1];
  }

  return field.id;
}

function getFieldDisplayName(field: Field): string {
  return field.dimensions?.[0]?.name || field.display_name || field.name;
}

function getFieldIcon(field: Field): IconName {
  // TODO: use `getColumnIcon` from "metabase/common/utils/columns"
  return "calendar";
}
