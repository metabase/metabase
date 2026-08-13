import { useCallback, useMemo, useState } from "react";

export type UseListSelectReturnValue<T> = {
  clear: () => void;
  getIsSelected: (item: T) => boolean;
  selected: T[];
  selectOnlyTheseItems: (items: T[]) => void;
  toggleItem: (item: T) => void;
};

export function useListSelect<T>(
  keyFn: (item: T) => string,
): UseListSelectReturnValue<T> {
  const [selectedByKey, setSelectedByKey] = useState<ReadonlyMap<string, T>>(
    new Map(),
  );

  const getIsSelected = useCallback(
    (item: T) => selectedByKey.has(keyFn(item)),
    [keyFn, selectedByKey],
  );

  const selectOnlyTheseItems = useCallback(
    (items: T[]) => {
      setSelectedByKey(new Map(items.map((item) => [keyFn(item), item])));
    },
    [keyFn],
  );

  const toggleItem = useCallback(
    (item: T) => {
      setSelectedByKey((previous) => {
        const key = keyFn(item);
        const next = new Map(previous);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.set(key, item);
        }
        return next;
      });
    },
    [keyFn],
  );

  const clear = useCallback(() => {
    setSelectedByKey(new Map());
  }, []);

  const selected = useMemo(
    () => Array.from(selectedByKey.values()),
    [selectedByKey],
  );

  return {
    clear,
    getIsSelected,
    selected,
    selectOnlyTheseItems,
    toggleItem,
  };
}
