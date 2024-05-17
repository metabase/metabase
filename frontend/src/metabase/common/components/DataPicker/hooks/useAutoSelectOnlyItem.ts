import { useEffect } from "react";
import { useLatest } from "react-use";

interface Props<Item> {
  disabled: boolean;
  items: Item[] | undefined;
  onChange: (item: Item) => void;
}

/**
 * Automatically selects the only item on the list.
 * Does nothing if there's 0 items or more than 1.
 *
 * @returns true when there's only 1 item.
 */
export const useAutoSelectOnlyItem = <Item>({
  disabled,
  items,
  onChange,
}: Props<Item>): boolean => {
  // use ref to avoid triggering the effect too often
  const onChangeRef = useLatest(onChange);
  const hasOnly1Item = items?.length === 1;
  const onlyItem = hasOnly1Item ? items[0] : undefined;

  useEffect(
    function autoSelectOnlyItem() {
      if (!disabled && onlyItem) {
        onChangeRef.current(onlyItem);
      }
    },
    [disabled, onlyItem, onChangeRef],
  );

  // let consumer component know when to not render itself
  return hasOnly1Item;
};
