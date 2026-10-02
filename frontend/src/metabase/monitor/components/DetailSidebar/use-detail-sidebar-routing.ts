import { useCallback, useMemo } from "react";

import { useLocation, useNavigate } from "metabase/router";

type DetailSidebarRoutingOptions<TItem, TId> = {
  /** The rows of the page the sidebar opens beside, in the order they are shown. */
  items: TItem[];
  getItemId: (item: TItem) => TId;
  /** The id in the URL, or undefined when the sidebar is closed. */
  selectedId: TId | undefined;
  /** The list's own URL, which closing returns to. */
  listPath: string;
  getDetailPath: (id: TId) => string;
};

/**
 * Routing for a Monitor list page whose detail sidebar is a child route: where previous and next go, which row the
 * sidebar opened on, and how to open and close it. The page's own state — page, search, filters, sort — lives in the
 * query string, which every navigation carries over, so closing the sidebar returns to exactly the list the admin
 * was reading.
 *
 * Previous and next step through the rows of the current page only. Paging to reach the next one is the list's job.
 */
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
      selectedId === undefined
        ? -1
        : items.findIndex((item) => getItemId(item) === selectedId);
    if (index === -1) {
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
