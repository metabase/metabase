import { color } from "metabase/lib/colors";
import type { ObjectWithModel } from "metabase/lib/icon";
import { getIcon } from "metabase/lib/icon";

import type { TypeWithModel } from "./types";

export const getEntityPickerIcon = <Id, Model extends string>(
  item: TypeWithModel<Id, Model>,
  isSelected?: boolean,
) => {
  const icon = getIcon(item as ObjectWithModel);

  if (["person", "group"].includes(icon.name)) {
    // should inherit color
    return icon;
  }

  if (isSelected && !icon.color) {
    icon.color = color("white");
  }

  if (icon.name === "folder" && isSelected) {
    icon.name = "folder_filled";
  }

  return { ...icon, color: color(icon.color ?? "brand") };
};

export const isSelectedItem = <Id, Model extends string>(
  item: TypeWithModel<Id, Model>,
  selectedItem: TypeWithModel<Id, Model> | null,
): boolean => {
  return (
    !!selectedItem &&
    item.id === selectedItem.id &&
    item.model === selectedItem.model
  );
};
