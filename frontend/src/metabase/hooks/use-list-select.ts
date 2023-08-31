import { useState, useCallback } from "react";

export const useListSelect = (keyFn = (item: any) => item) => {
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [selected, setSelected] = useState<any[]>([]);

  const getIsSelected = useCallback(
    item => selectedKeys.has(keyFn(item)),
    [keyFn, selectedKeys],
  );

  const selectOnlyTheseItems = useCallback(
    items => {
      const newSelected = items;
      const newSelectedKeys = new Set(newSelected.map(keyFn));

      setSelectedKeys(newSelectedKeys);
      setSelected(newSelected);
    },
    [keyFn],
  );

  const toggleItem = useCallback(
    itemBeingToggled => {
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
};
