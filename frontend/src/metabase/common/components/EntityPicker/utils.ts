import { entityForObject } from "metabase/lib/schema";
import type { SearchModelType } from "metabase-types/api";

import type { TypeWithModel } from "./types";

export const getIcon = <Id, Model extends SearchModelType>(
  item: TypeWithModel<Id, Model>,
) => {
  const entity = entityForObject(item);
  return entity?.objectSelectors?.getIcon?.(item) || { name: "table" };
};

export const isSelectedItem = <Id, Model extends SearchModelType>(
  item: TypeWithModel<Id, Model>,
  selectedItem: TypeWithModel<Id, Model> | null,
): boolean => {
  return (
    !!selectedItem &&
    item.id === selectedItem.id &&
    item.model === selectedItem.model
  );
};
