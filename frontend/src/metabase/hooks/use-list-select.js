import { useState, useCallback } from "react";

export const useListSelect = (keyFn = item => item) => {
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [selected, setSelected] = useState([]);

  const toggleAll = useCallback(
    items => {
      const additions = items.filter(item => !selectedKeys.has(keyFn(item)));
      const deletionsKeys = new Set(
        items.filter(item => selectedKeys.has(keyFn(item))).map(keyFn),
      );

      const newSelected = selected
        .filter(item => !deletionsKeys.has(keyFn(item)))
        .concat(additions);
      const newSelectedKeys = new Set(newSelected.map(keyFn));

      setSelectedKeys(newSelectedKeys);
      setSelected(newSelected);
    },
    [keyFn, selected, selectedKeys],
  );

  const toggleItem = useCallback(item => toggleAll([item]), [toggleAll]);

  const getIsSelected = useCallback(
    item => selectedKeys.has(keyFn(item)),
    [keyFn, selectedKeys],
  );

  const clear = useCallback(() => {
    setSelectedKeys(new Set());
    setSelected([]);
  }, []);

  return {
    selected,
    toggleItem,
    toggleAll,
    getIsSelected,
    clear,
  };
};
