import type { PickerState, TypeWithModel } from "../../types";

// reverse-traverse the statePath to find the last selected item
export const findLastSelectedItem = <Item, Query>(
  statePath: PickerState<Item, Query>,
) => {
  for (let i = statePath.length - 1; i >= 0; i--) {
    if (statePath[i].selectedItem) {
      return statePath[i].selectedItem;
    }
  }
  return undefined;
};

export const isSameItem = <
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>(
  item1?: Item,
  item2?: Item,
): boolean => {
  return item1?.id === item2?.id && item1?.model === item2?.model;
};
