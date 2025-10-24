import { useDeferredValue, useMemo, useState } from "react";

export function useItemsListFilter<T>(
  items: T[],
  filterFn: (item: T, query: string) => boolean,
) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const filteredItems = useMemo(() => {
    if (!deferredQuery) {
      return items;
    }
    const lowerQuery = deferredQuery.toLowerCase();
    return items.filter((item) => filterFn(item, lowerQuery));
  }, [items, deferredQuery, filterFn]);

  return { query, setQuery, deferredQuery, filteredItems };
}
