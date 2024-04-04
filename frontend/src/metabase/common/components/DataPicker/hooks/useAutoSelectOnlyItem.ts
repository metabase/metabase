import { useEffect } from "react";
import { useLatest } from "react-use";

import type { NotebookDataPickerFolderItem } from "../types";

/**
 * Automatically selects the only item on the list.
 * Does nothing if there's 0 items or more than 1.
 *
 * @returns true when there's only 1 item.
 */
export const useAutoSelectOnlyItem = (
  items: NotebookDataPickerFolderItem[] | undefined,
  onChange: (item: NotebookDataPickerFolderItem) => void,
): boolean => {
  const onChangeRef = useLatest(onChange);
  const hasOnly1Item = items?.length === 1;

  useEffect(() => {
    // automatically select the only item on the list
    if (hasOnly1Item) {
      const [item] = items;
      onChangeRef.current(item);
    }
  }, [hasOnly1Item, items, onChangeRef]);

  // let consumer component know when to not render itself
  return hasOnly1Item;
};
