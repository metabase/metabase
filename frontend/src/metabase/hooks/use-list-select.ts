import { useState, useCallback } from "react";

export function useListSelect<T>(keyFn: (item: T) => string) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<T[]>([]);

  const getIsSelected = useCallback(
    (item: T) => selectedKeys.has(keyFn(item)),
    [keyFn, selectedKeys],
  );

  const selectOnlyTheseItems = useCallback(
    (items: T[]) => {
      const newSelected = items;
      const newSelectedKeys = new Set(newSelected.map(keyFn));

      setSelectedKeys(newSelectedKeys);
      setSelected(newSelected);
    },
    [keyFn],
  );

  const toggleItem = useCallback(
    (itemBeingToggled: T) => {
      const isItemSelected = getIsSelected(itemBeingToggled);

      const newSelected = isItemSelected
        ? selected.filter(item => keyFn(item) !== keyFn(itemBeingToggled))
        : [...selected, itemBeingToggled];
      const newSelectedKeys = new Set(newSelected.map(keyFn));

      setSelectedKeys(newSelectedKeys);
      setSelected(newSelected);
    },
    [keyFn, selected, getIsSelected],
  );

  const clear = useCallback(() => {
    setSelectedKeys(new Set());
    setSelected([]);
  }, []);

  return {
    clear,
    getIsSelected,
    selected,
    selectOnlyTheseItems,
    toggleItem,
  };
}
