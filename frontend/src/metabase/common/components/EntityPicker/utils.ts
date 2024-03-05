import { entityForObject } from "metabase/lib/schema";

import type { TypeWithModel } from "./types";

export const getIcon = (item: TypeWithModel) => {
  const entity = entityForObject(item);
  return entity?.objectSelectors?.getIcon?.(item) || { name: "table" };
};

export const isSelectedItem = (
  item: TypeWithModel,
  selectedItem: TypeWithModel | null,
): boolean => {
  return (
    !!selectedItem &&
    item.id === selectedItem.id &&
    item.model === selectedItem.model
  );
};
