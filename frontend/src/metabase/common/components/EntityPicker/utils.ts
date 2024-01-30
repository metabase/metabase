import { entityForObject } from "metabase/lib/schema";
import type { PickerItem } from "./types";

export const getIcon = (item: PickerItem) => {
  const entity = entityForObject(item);
  return entity?.objectSelectors?.getIcon?.(item)?.name || "table";
};

export const isSelectedItem = (
  item: PickerItem,
  selectedItem: PickerItem | null,
): boolean => {
  return (
    !!selectedItem &&
    item.id === selectedItem.id &&
    item.model === selectedItem.model
  );
};
