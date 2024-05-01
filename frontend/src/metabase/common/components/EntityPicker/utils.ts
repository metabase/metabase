import { entityForObject } from "metabase/lib/schema";

import type { TypeWithModel } from "./types";

export const getIcon = <Id, Model extends string>(
  item: TypeWithModel<Id, Model>,
) => {
  const entity = entityForObject(item);
  return entity?.objectSelectors?.getIcon?.(item) || { name: "table" };
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
