import { createRef, useCallback, useMemo } from "react";

export function useScrollListItemIntoView<K extends string>(itemIds: K[]) {
  const listItemRefs = useMemo(() => {
    return itemIds.reduce(
      (refs, itemId) => {
        refs[itemId] = createRef<HTMLDivElement>();

        return refs;
      },
      {} as Record<K, React.RefObject<HTMLDivElement>>,
    );
  }, [itemIds]);

  const isValidItem = useCallback(
    (key: string | null): key is K => key != null && key in listItemRefs,
    [listItemRefs],
  );

  const scrollListItemIntoView = (itemId: string | null) => {
    if (isValidItem(itemId)) {
      const element = listItemRefs[itemId].current;

      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return { listItemRefs, scrollListItemIntoView };
}
