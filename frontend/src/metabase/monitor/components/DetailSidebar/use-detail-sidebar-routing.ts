import { useCallback, useMemo } from "react";

import { useLocation, useNavigate } from "metabase/router";

type DetailSidebarRoutingOptions<TItem, TId> = {
  items: TItem[] | undefined;
  getItemId: (item: TItem) => TId;
  selectedId: TId | undefined;
  listPath: string;
  getDetailPath: (id: TId) => string;
};

/** Previous/next and open/close for a detail sidebar that is a child route; previous and next stay on the page. */
export function useDetailSidebarRouting<TItem, TId>({
  items,
  getItemId,
  selectedId,
  listPath,
  getDetailPath,
}: DetailSidebarRoutingOptions<TItem, TId>) {
  const location = useLocation();
  const navigate = useNavigate();

  const navigateToItem = useCallback(
    (id: TId | undefined) => {
      navigate({
        pathname: id === undefined ? listPath : getDetailPath(id),
        search: location.search,
      });
    },
    [navigate, location.search, listPath, getDetailPath],
  );

  const closeSidebar = useCallback(
    () => navigateToItem(undefined),
    [navigateToItem],
  );

  const { prevId, nextId, selectedItem } = useMemo(() => {
    const index =
      selectedId === undefined || items === undefined
        ? -1
        : items.findIndex((item) => getItemId(item) === selectedId);
    if (items === undefined || index === -1) {
      return {
        prevId: undefined,
        nextId: undefined,
        selectedItem: undefined,
      };
    }
    return {
      prevId: index > 0 ? getItemId(items[index - 1]) : undefined,
      nextId:
        index < items.length - 1 ? getItemId(items[index + 1]) : undefined,
      selectedItem: items[index],
    };
  }, [items, getItemId, selectedId]);

  return { navigateToItem, closeSidebar, prevId, nextId, selectedItem };
}
