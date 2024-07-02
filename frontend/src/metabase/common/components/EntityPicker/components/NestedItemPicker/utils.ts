import type { PickerState } from "../../types";

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

export const generateKey = <Query>(query?: Query) =>
  JSON.stringify(query ?? "root");
